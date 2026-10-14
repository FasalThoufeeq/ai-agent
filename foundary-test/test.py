from azure.identity import DefaultAzureCredential
from azure.ai.projects import AIProjectClient

PROJECT_ENDPOINT = "https://fasal-ai-learning2-resource.services.ai.azure.com/api/projects/fasal-ai-learning2"

project = AIProjectClient(
    endpoint=PROJECT_ENDPOINT,
    credential=DefaultAzureCredential(),
)

openai = project.get_openai_client()

# Store conversation history
conversation = []

while True:
    print("\n" + "=" * 50)
    print("1. Ask another question")
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

        # Add user's question to conversation
        conversation.append({
            "role": "user",
            "content": question
        })

        try:
            response = openai.responses.create(
                model="gpt-5-mini",
                tools=[{"type": "web_search"}],
                input=conversation
            )

            answer = response.output_text

            print("\nAI RESPONSE:")
            print(answer)

            # Add AI response to conversation
            conversation.append({
                "role": "assistant",
                "content": answer
            })

        except Exception as e:
            print("\nError:")
            print(e)

    else:
        print("\nInvalid option. Please choose 1 or 2.")