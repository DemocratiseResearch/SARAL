
- please get a GEMINI_API_KEY, it is needed!.
- go to backend and put GEMINI_API_KEY=your_gemini_api_key in a .env file
- also you will need GOOGLE_CLIENT_ID , go to GCP console and create OAuth 2.0 Client IDs credentials, put the client id in the .env file as GOOGLE_CLIENT_ID=your_google_client_id. Make sure localhost:3000 is authorized JavaScript origin.
- you will also need to add the SAME client id in frontend .env ,as REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id
- if you see your backend giving some weird error, correctly setup the postgres db from database.py

- For manim if you face any issue , ideally use conda env that I have attached, create it with python 3.10
