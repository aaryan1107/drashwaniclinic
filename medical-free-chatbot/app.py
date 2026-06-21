import re
import json
import requests
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma:2b"  # Change to "gemma:7b" if you have more RAM

# ─── Medical Safety Layer ─────────────────────────────────────────────────────

EMERGENCY_KEYWORDS = [
    "chest pain", "chest ache", "heart attack", "unconscious", "fainted",
    "stroke", "breathless", "can't breathe", "cannot breathe", "severe weakness",
    "confusion", "very low sugar", "seizure", "fitting", "severe vomiting",
    "not waking", "collapsed", "paralysis", "slurred speech", "severe dehydration",
    "allergic reaction", "swelling of face", "swelling of throat"
]

HIGH_RISK_KEYWORDS = [
    "very high sugar", "sugar very high", "sugar above 400", "sugar 400",
    "very low sugar", "sugar below 60", "sugar 50", "sugar 40",
    "very high bp", "bp very high", "bp 200", "bp 180",
    "repeated vomiting", "vomiting after injection", "vomiting after medicine",
    "severe side effect", "foot wound", "foot ulcer", "infection in foot",
    "diabetic foot", "pregnant", "pregnancy", "child patient", "fainting",
    "fainted", "very weak", "severe weakness"
]

MEDICINE_CHANGE_KEYWORDS = [
    "stop medicine", "stop my medicine", "stop insulin", "stop ozempic",
    "stop mounjaro", "stop semaglutide", "change dose", "increase dose",
    "reduce dose", "decrease dose", "double dose", "skip dose",
    "should i take", "can i take", "start medicine", "start insulin",
    "change insulin", "increase insulin", "reduce insulin",
    "change mounjaro", "change semaglutide", "which medicine", "what medicine"
]

DISCLAIMER = "\n\n*For personal advice, please consult Dr. Ashwani Kansal.*"

DOCTOR_NAME = "Dr. Ashwani Kansal"

SYSTEM_PROMPT = """You are a safe clinic assistant chatbot for Dr. Ashwani Kansal Metabolic Care clinic.
The clinic specialises in diabetes, obesity, thyroid, fatty liver, blood pressure, cholesterol, diabetic neuropathy, CGM, and lifestyle disease management.

Your job is to:
- Provide general health education in simple, calm, patient-friendly language
- Help patients understand their conditions in basic terms
- Guide patients to book appointments or consultations
- Collect basic health updates (sugar, BP, weight, symptoms, side effects)
- Encourage follow-up compliance
- Always redirect personal medical decisions to Dr. Ashwani Kansal

You must NEVER:
- Diagnose a patient
- Prescribe medicine
- Advise stopping, starting, or changing any medicine, insulin, semaglutide, or Mounjaro
- Claim diabetes is reversed or cured
- Give personalized treatment plans
- Replace doctor consultation

Answer style:
- Maximum 4 sentences per response
- Never write long paragraphs
- Be direct and to the point
- Do not repeat yourself
- Do not add unnecessary welcome messages or introductions
- Always end medical answers with: "For personal advice, please consult Dr. Ashwani Kansal."
- Calm tone, no panic unless it is a genuine emergency keyword

If asked about diabetes reversal, explain it generally but say: "Whether reversal has happened must be assessed only by the doctor based on reports and follow-up."

If asked about semaglutide or Mounjaro doses, say: "Please consult Dr. Ashwani Kansal before changing dose or continuing if you are facing side effects."

Keep answers concise. Avoid unnecessary long paragraphs. Be warm and supportive."""


def check_emergency(text):
    t = text.lower()
    for kw in EMERGENCY_KEYWORDS:
        if kw in t:
            return True
    return False


def check_high_risk(text):
    t = text.lower()
    for kw in HIGH_RISK_KEYWORDS:
        if kw in t:
            return True
    return False


def check_medicine_change(text):
    t = text.lower()
    for kw in MEDICINE_CHANGE_KEYWORDS:
        if kw in t:
            return True
    return False


def create_risk_alert(user_message, risk_type):
    return {
        "type": risk_type,
        "message": user_message,
        "flagged": True,
        "action": "Doctor review required"
    }


def build_safe_response(user_message):
    """
    Safety layer: check message before sending to Gemma.
    Returns (safe_response_or_None, risk_alert_or_None)
    If safe_response is not None, skip Gemma and return it directly.
    """
    if check_emergency(user_message):
        alert = create_risk_alert(user_message, "EMERGENCY")
        response = (
            "🚨 *This may be a medical emergency.*\n\n"
            "Please seek emergency medical care immediately or contact local emergency services (112).\n\n"
            "Do not wait. Go to the nearest hospital emergency department now."
        )
        return response, alert

    if check_medicine_change(user_message):
        alert = create_risk_alert(user_message, "MEDICINE_CHANGE_REQUEST")
        response = (
            "I cannot advise medicine or dose changes.\n\n"
            f"Please consult {DOCTOR_NAME} before starting, stopping, or changing any medicine, "
            "insulin, semaglutide, or Mounjaro dose."
        )
        return response, alert

    if check_high_risk(user_message):
        alert = create_risk_alert(user_message, "HIGH_RISK_SYMPTOM")
        return None, alert  # Let Gemma answer but flag it

    return None, None


def query_gemma(conversation_history, user_message):
    """Send message to locally running Gemma via Ollama."""

    # Build a clean prompt with conversation context
    history_text = ""
    for msg in conversation_history[-6:]:  # Last 6 messages for context
        role = "Patient" if msg["role"] == "user" else "Assistant"
        history_text += f"{role}: {msg['content']}\n"

    full_prompt = f"""{SYSTEM_PROMPT}

Conversation so far:
{history_text}
Patient: {user_message}
Assistant:"""

    payload = {
        "model": MODEL_NAME,
        "prompt": full_prompt,
        "stream": False,
        "options": {
            "temperature": 0.4,
            "top_p": 0.9,
            "num_predict": 200
        }
    }

    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        answer = data.get("response", "").strip()
        return answer
    except requests.exceptions.ConnectionError:
        return (
            "I am unable to connect to the AI model right now. "
            "Please make sure Ollama is running (`ollama serve`) and try again."
        )
    except requests.exceptions.Timeout:
        return (
            "The response is taking too long. "
            "Please try a shorter question or restart Ollama."
        )
    except Exception as e:
        return f"An error occurred: {str(e)}"


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/chat", methods=["POST"])
def chat():
    body = request.get_json()
    user_message = body.get("message", "").strip()
    conversation_history = body.get("history", [])

    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    # Run safety layer first
    safe_response, risk_alert = build_safe_response(user_message)

    if safe_response:
        # Emergency or medicine-change: return immediately, skip Gemma
        return jsonify({
            "response": safe_response,
            "alert": risk_alert,
            "source": "safety_layer"
        })

    # Send to Gemma
    gemma_response = query_gemma(conversation_history, user_message)

    # Add disclaimer to medical answers
    medical_topics = [
        "diabetes", "insulin", "sugar", "hba1c", "thyroid", "tsh", "bp",
        "blood pressure", "obesity", "weight", "fatty liver", "cholesterol",
        "neuropathy", "cgm", "semaglutide", "mounjaro", "ozempic", "medicine",
        "treatment", "diet", "exercise", "reversal"
    ]
    msg_lower = user_message.lower()
    is_medical = any(topic in msg_lower for topic in medical_topics)

    if is_medical and DISCLAIMER not in gemma_response:
        gemma_response += DISCLAIMER

    return jsonify({
        "response": gemma_response,
        "alert": risk_alert,
        "source": "gemma"
    })


@app.route("/health")
def health():
    """Check if Ollama is reachable."""
    try:
        resp = requests.get("http://localhost:11434/api/tags", timeout=5)
        models = [m["name"] for m in resp.json().get("models", [])]
        return jsonify({"ollama": "running", "models": models})
    except Exception:
        return jsonify({"ollama": "not reachable", "models": []}), 503


if __name__ == "__main__":
    print("\n✅ Dr. Ashwani Kansal Metabolic Care — Chatbot v1")
    print("   Model  : Gemma via Ollama (local, free)")
    print("   Safety : Emergency + Medicine + High-Risk detection")
    print("   URL    : http://localhost:5000\n")
    app.run(debug=True, port=5000)