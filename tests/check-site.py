"""Check published dashboard pages and the preset views linked from articles."""

from html.parser import HTMLParser
from pathlib import Path
import sys
from urllib.parse import parse_qs, unquote, urlsplit


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.links = []
        self.frames = []
        self.scripts = []
        self.images = []
        self.ids = set()
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.add(attrs["id"])
        if tag == "a" and "href" in attrs:
            self.links.append(attrs["href"])
        if tag == "img" and "src" in attrs:
            self.images.append(attrs["src"])
        if tag in {"iframe", "script"} and "src" in attrs:
            (self.frames if tag == "iframe" else self.scripts).append(attrs["src"])


def local_file(site, page, url):
    path = urlsplit(url)
    if path.scheme or path.netloc or not path.path:
        return None
    name = unquote(path.path)
    target = site / name.lstrip("/") if name.startswith("/") else page.parent / name
    if target.is_dir():
        target /= "index.html"
    return target


def preset_link(page, *, path_end, field=None):
    matches = [
        urlsplit(link) for link in page.links
        if urlsplit(link).path.endswith(path_end)
        and (field is None or field in parse_qs(urlsplit(link).query))
    ]
    assert len(matches) == 1, f"Expected one preset link to {path_end}"
    return matches[0]


def main(site):
    pages = [site / "index.html"]
    pages += list((site / "articles").glob("*.html"))
    pages += list((site / "projects").glob("*.html"))
    dashboards = []
    for path in pages:
        page = Page(path)
        for url in page.links + page.frames + page.scripts:
            target = local_file(site, path, url)
            assert target is None or target.is_file(), f"{path}: missing {url}"
        if path.parent.name == "projects" and path.name != "index.html":
            assert len(page.frames) == 1, f"{path}: expected one dashboard embed"
            assert page.frames[0] in page.links, f"{path}: missing full-screen link"
            dashboards.append(path.name)
    assert len(dashboards) >= 8, f"Missing dashboard pages: found {dashboards}"

    home = Page(site / "index.html")
    home_dashboard_links = {local_file(site, site / "index.html", url) for url in home.links}
    home_images = {local_file(site, site / "index.html", url) for url in home.images}
    for name in dashboards:
        assert site / "projects" / name in home_dashboard_links, f"Homepage missing direct link to {name}"
        preview = site / "assets" / "home" / Path(name).with_suffix(".webp")
        assert preview in home_images and preview.is_file(), f"Missing homepage screenshot for {name}"
    assert not any((urlsplit(link).hostname or "").endswith(".chatgpt.site") for link in home.links), (
        "Homepage dashboard links should go to the GitHub Pages project pages"
    )

    recruiting = preset_link(Page(site / "articles/recruiting-distance.html"), path_end="dashboard.html")
    mapped = parse_qs(recruiting.fragment)
    assert {key: mapped[key] for key in ("t", "a", "b", "s", "r")} == {
        "t": ["blue"], "a": ["2010"], "b": ["2025"], "s": ["Maryland"], "r": ["250"]
    }

    spending_page = site / "articles/college-athletics-spending-index.html"
    spending = preset_link(Page(spending_page), path_end="athletics-spending-index.html", field="chart")
    chart = parse_qs(parse_qs(spending.query)["chart"][0])
    assert spending.fragment in Page(local_file(site, spending_page, spending.geturl())).ids
    assert chart["base"] == chart["first"] == ["2019"] and chart["last"] == ["2025"]
    assert chart["series"] == [
        "Total athletics spending benchmark",
        "Total athletics expense|Same 53 reporting Power Four|EADA",
        "CPI-U comparator",
    ]
    print(f"Checked local links, {len(dashboards)} dashboard pages, homepage dashboard links, and two article presets.")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
