import requests
from bs4 import BeautifulSoup
import json
import time
import os

BASE_URL = "https://intercom.help"
START_URL = f"{BASE_URL}/mylogiwa/en"

def get_soup(url):
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return BeautifulSoup(response.text, 'html.parser')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def extract_article_content(article_url):
    print(f"Scraping article: {article_url}")
    soup = get_soup(article_url)
    if not soup:
        return None
    
    # Locate title
    title_element = soup.find('h1')
    title = title_element.text.strip() if title_element else "Untitled"
    
    # Locate article body
    article_body = soup.find('article') or soup.find('div', class_='article-body')
    if not article_body:
        return None
        
    # Extract text, removing unnecessary tags
    for tag in article_body(['script', 'style', 'nav', 'header', 'footer']):
        tag.decompose()
        
    content = article_body.get_text(separator='\n', strip=True)
    return {"title": title, "url": article_url, "content": content}

def main():
    print(f"Starting crawler at {START_URL} ...")
    soup = get_soup(START_URL)
    if not soup:
        print("Failed to access main help center page.")
        return

    article_links = set()
    
    # 1. Find Collections (Categories)
    collections = soup.find_all('a', href=True)
    collection_urls = [a['href'] for a in collections if '/en/collections/' in a['href']]
    
    for c_url in collection_urls:
        full_c_url = BASE_URL + c_url if c_url.startswith('/') else c_url
        print(f"Checking collection: {full_c_url}")
        c_soup = get_soup(full_c_url)
        if not c_soup:
            continue
            
        # 2. Find Sections or Articles within Collections
        links = c_soup.find_all('a', href=True)
        for a in links:
            href = a['href']
            if '/en/articles/' in href:
                full_a_url = BASE_URL + href if href.startswith('/') else href
                article_links.add(full_a_url)
            elif '/en/sections/' in href:
                # Sometimes articles are inside sections
                full_s_url = BASE_URL + href if href.startswith('/') else href
                s_soup = get_soup(full_s_url)
                if s_soup:
                    s_links = s_soup.find_all('a', href=True)
                    for sa in s_links:
                        s_href = sa['href']
                        if '/en/articles/' in s_href:
                            full_sa_url = BASE_URL + s_href if s_href.startswith('/') else s_href
                            article_links.add(full_sa_url)

    print(f"Found {len(article_links)} unique articles. Starting to scrape content...")
    
    scraped_data = []
    for url in article_links:
        data = extract_article_content(url)
        if data:
            scraped_data.append(data)
        time.sleep(0.5) # Be polite
        
    # Save to src/constants
    output_path = os.path.join('src', 'constants', 'helpCenter.json')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(scraped_data, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully scraped {len(scraped_data)} articles. Saved to {output_path}")

if __name__ == "__main__":
    main()
