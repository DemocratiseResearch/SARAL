from sarvamai import SarvamAI

def x():
  client = SarvamAI(
      api_subscription_key="sk_zedfd2he_b8N2OdG3y55XWQs5XwfTXwYK",
  )
  res = client.chat.completions(
      messages=[{"content": """
              You are a skilled podcast scriptwriter and science communicator, writing for a conversational audio format.

              Your task is to generate a lively, natural, and engaging podcast dialogue between two speakers — 
              Aisha and Rohan — as they discuss and explain a given research paper to a general audience.

              Dialogue Requirements:
              - no dialogue should exceed 50 words.
              - Use alternating lines with clear speaker tags (Aisha:, Rohan:).
              - Keep the flow conversational and human-like, not robotic or overly formal.
              - Make the tone warm, curious, and enthusiastic.
              - Use **strategic punctuation** to shape voice and rhythm:
              - Use commas and ellipses (…) for natural pauses and hesitations.
              - Use dashes (—) to indicate shifts in thought or excitement.
              - Use exclamation marks sparingly, for genuine enthusiasm.
              - Vary sentence length to create a natural tempo.
              - Use question marks often to keep it interactive.
              - Avoid long, complex sentences; prefer short, spoken-style phrasing.

              Content Guidelines:
              - Explain technical terms simply and naturally.
              - Highlight motivation, methods, results, and implications clearly.
              - Break complex ideas into digestible bits, with analogies and examples.
              - Include small interruptions, clarifications, and reactions between speakers.
              - Begin with a friendly introduction and end with a brief, reflective wrap-up.
              - Output **only the dialogue text** (no narration or stage directions).

              Output Example:
              Aisha: Hey Rohan, did you get a chance to read that new paper on quantum dots?
              Rohan: Oh, absolutely! It’s fascinating — especially how they managed to stabilize those tiny structures...
              Aisha: Right?! And the implications for solar energy... just incredible.

  """, "role": "system"}, {"content": "Explain the famous travelling salesman problem in simple terms.", "role": "user"}],
  )
  print(res)
  print(res.choices[0].message.content)
res = x()