import os
from openai import OpenAI

PROJECT_ENDPOINT = "https://fasal-ai-learning-resource.services.ai.azure.com/api/projects/fasal-ai-learning"

# Set your API key as an environment variable
API_KEY = ""

openai = OpenAI(
    api_key=API_KEY,
    base_url=PROJECT_ENDPOINT + "/openai/v1/"
)

# Store conversation history
conversation = []

while True:
    print("\n" + "=" * 50)
    print("1. Ask another questionn")
    print("2. Exit")
    print("=" * 50)

    choice = input("Choose an option: ").strip()

    if choice == "2":
        print("\nGoodbye! 👋")
        break

    elif choice == "1":

        question = input("\nYour question: ").strip()

        if not question:
            print("Please enter a question.")
            continue

        conversation.append({
            "role": "user",
            "content": question
        })

        try:
            response = openai.responses.create(
                model="gpt-5-mini",
                input=conversation
            )

            answer = response.output_text

            print("\nAI RESPONSE:")
            print(answer)

            conversation.append({
                "role": "assistant",
                "content": answer
            })

        except Exception as e:
            print("\nError:")
            print(e)

    else:
        print("\nInvalid option. Please choose 1 or 2.")