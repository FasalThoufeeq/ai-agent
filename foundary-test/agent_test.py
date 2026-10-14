
import requests
from azure.identity import AzureCliCredential

# Get an access token using your Azure CLI login
credential = AzureCliCredential()
token = credential.get_token("https://ai.azure.com/.default").token

# Your Microsoft Foundry hosted agent endpoint
url = (
    "https://fasal-ai-learning2-resource.services.ai.azure.com"
    "/api/projects/fasal-ai-learning2/agents/learning"
    "/endpoint/protocols/openai/responses"
    "?api-version=2025-11-15-preview"
)

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
}

payload = {
    "input": "Say hello"
}

response = requests.post(
    url,
    headers=headers,
    json=payload,
    timeout=60,
)

print("Status:", response.status_code)
print("Response:", response.text)

response.raise_for_status()
