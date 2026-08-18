import json
import re
import time
from collections import deque
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

BASE = "https://intercom.help/mylogiwa/en"
START = f"{BASE}/"
OUTPUT = Path(__file__).parent / "src" / "constants" / "helpCenter.json"
USER_AGENT = (
    "Mozilla/5.0 (compatible; LogiwaAPIConsultant/1.0; "
    "+https://github.com/cihanhartamaci/logiwa-api-consultant)"
)
DELAY_SECONDS = 0.35
MAX_PAGES = 2500

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en"})


def normalize_url(url: str) -> str:
    parsed = urlparse(urljoin(START, url))
    if parsed.netloc and parsed.netloc != "intercom.help":
        return ""
    path = parsed.path.rstrip("/") or "/"
    if not path.startswith("/mylogiwa/en"):
        return ""
    if any(path.endswith(ext) for ext in (".xml", ".json", ".png", ".jpg", ".svg", ".css", ".js")):
        return ""
    # Drop fragments and most query params except pagination.
    query = ""
    if parsed.query:
        params = []
        for part in parsed.query.split("&"):
            key = part.split("=", 1)[0].lower()
            if key in {"page"}:
                params.append(part)
        query = "&".join(params)
    return urlunparse(("https", "intercom.help", path, "", query, ""))


def article_id(url: str) -> str:
    match = re.search(r"/articles/(\d+)", url)
    return match.group(1) if match else ""


def extract_links(soup: BeautifulSoup, current_url: str) -> list[str]:
    links = []
    for a in soup.select("a[href]"):
        href = a.get("href") or ""
        if href.startswith("#") or href.startswith("mailto:"):
            continue
        normalized = normalize_url(urljoin(current_url, href))
        if normalized:
            links.append(normalized)
    return links


def extract_text(element) -> str:
    if not element:
        return ""
    for tag in element.select("script, style, nav, footer, noscript"):
        tag.decompose()
    text = element.get_text("\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_article(soup: BeautifulSoup, url: str) -> dict | None:
    if "/articles/" not in url:
        return None

    title = ""
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        title = og["content"].split(" | ")[0].strip()
    if not title:
        heading = soup.find(["h1", "h2"])
        title = heading.get_text(" ", strip=True) if heading else ""
    title = re.sub(r"\s+", " ", title).strip()

    body = (
        soup.select_one("article")
        or soup.select_one(".article")
        or soup.select_one(".intercom-interblocks")
        or soup.select_one("[class*='article-body']")
        or soup.select_one("main")
        or soup.body
    )
    content = extract_text(body)
    if not title or len(content) < 80:
        return None

    return {
        "title": title,
        "url": url.split("?")[0],
        "content": content,
    }


def crawl() -> list[dict]:
    queue = deque([START])
    visited: set[str] = set()
    articles: dict[str, dict] = {}

    while queue and len(visited) < MAX_PAGES:
        url = queue.popleft()
        if url in visited:
            continue
        visited.add(url)

        try:
            response = session.get(url, timeout=30)
            response.raise_for_status()
        except requests.RequestException as exc:
            print(f"SKIP {url}: {exc}")
            continue

        soup = BeautifulSoup(response.text, "html.parser")
        article = extract_article(soup, url)
        if article:
            ident = article_id(article["url"]) or article["url"]
            if ident not in articles:
                articles[ident] = article
                print(f"ARTICLE {len(articles):03d} {article['title']}")

        for link in extract_links(soup, url):
            path = urlparse(link).path
            if any(token in path for token in ("/articles/", "/collections/", "/sections/")) or link.rstrip("/") == BASE:
                if link not in visited:
                    queue.append(link)

        time.sleep(DELAY_SECONDS)

    return sorted(articles.values(), key=lambda item: item["url"])


def main() -> None:
    print("Crawling Logiwa Help Center...")
    articles = crawl()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(articles, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(articles)} articles to {OUTPUT}")


if __name__ == "__main__":
    main()
