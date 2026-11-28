"""Download public dashboard inputs with bounded retries."""
import json
import shutil
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

RELEASE = 'https://github.com/sportsdataverse/sportsdataverse-data/releases/download'
ESPN = 'https://site.api.espn.com/apis/site/v2/sports'


def fetch(url, output=None):
    request = Request(url, headers={'User-Agent': 'Terrapinalytics data refresh'})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=60) as response:
                if output is None:
                    return response.read()
                with output.open('wb') as file:
                    shutil.copyfileobj(response, file)
                return
        except (URLError, TimeoutError) as error:
            if attempt == 2 or isinstance(error, HTTPError) and error.code in (403, 404):
                raise
            time.sleep(2 ** attempt)


def json_from(url):
    return json.loads(fetch(url))
