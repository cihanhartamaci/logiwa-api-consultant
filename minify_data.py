import json
import os

def remove_bloat(obj):
    if isinstance(obj, dict):
        keys_to_delete = ['example', 'examples']
        for k in keys_to_delete:
            if k in obj:
                del obj[k]
        for k, v in obj.items():
            remove_bloat(v)
    elif isinstance(obj, list):
        for item in obj:
            remove_bloat(item)

def main():
    swagger_path = os.path.join("src", "constants", "swagger.json")
    help_path = os.path.join("src", "constants", "helpCenter.json")
    
    # 1. Minify Swagger
    if os.path.exists(swagger_path):
        print(f"Original swagger size: {os.path.getsize(swagger_path)} bytes")
        with open(swagger_path, 'r', encoding='utf-8') as f:
            swagger_data = json.load(f)
            
        remove_bloat(swagger_data)
        
        with open(swagger_path, 'w', encoding='utf-8') as f:
            json.dump(swagger_data, f, separators=(',', ':'))
        print(f"Minified swagger size: {os.path.getsize(swagger_path)} bytes")

    # 2. Minify Help Center
    if os.path.exists(help_path):
        print(f"Original helpCenter size: {os.path.getsize(help_path)} bytes")
        with open(help_path, 'r', encoding='utf-8') as f:
            help_data = json.load(f)
            
        for item in help_data:
            # Keep max 1500 chars to save tokens safely
            if 'content' in item and len(item['content']) > 1500:
                item['content'] = item['content'][:1500] + "...(truncated)"
                
        with open(help_path, 'w', encoding='utf-8') as f:
            json.dump(help_data, f, separators=(',', ':'))
        print(f"Minified helpCenter size: {os.path.getsize(help_path)} bytes")

if __name__ == "__main__":
    main()
