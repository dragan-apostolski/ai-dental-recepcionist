# AI Dental Receptionist

A sophisticated AI-powered receptionist application designed for dental clinics. This project leverages the **Google Gemini Live API** for real-time natural language voice interactions, enabling patients to check availability and book appointments seamlessly in multiple languages.

## 🌟 Key Features

- **Voice-First AI Agent**: Powered by Google's Gemini Multimodal Live API, capable of natural, handle-free voice conversations.
- **Multilingual Support**: Fully localized for **Macedonian (`mk`)**, **Slovenian (`sl`)**, and **English (`en`)**, with specific cultural nuances and grammar rules (e.g., formal address, specific alphabetic spelling).
- **Smart Appointment Booking**: 
  - Real-time availability checks.
  - Integration with **Calendly** / **Cal.com** systems.
  - Secure booking validaton logic.
- **Admin Configuration**:
  - Customizable working hours and holidays.
  - Service catalog management (duration, price, description).
  - AI Persona settings (Agent name, tone).
- **Authentication**: Secured access via Supabase.

## 🛠️ Technology Stack

- **Frontend Framework**: React 19 (via Vite)
- **Styling**: Tailwind CSS
- **AI Core**: `@google/genai` (Gemini Flash 2.5 context)
- **State/Auth**: Supabase Client (`@supabase/supabase-js`)
- **Icons**: Lucide React
- **Audio Processing**: Web Audio API (PCM 16kHz/24kHz processing)

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- A Google Cloud Project with the **Gemini API** enabled.
- A **Calendly** or **Cal.com** account (for booking integration).
- A **Supabase** project (for authentication).

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-dental-recepnionist
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env.local` file in the root directory and add your API keys:
   ```env
   # Required for AI features
   GEMINI_API_KEY=your_google_gemini_api_key
   
   # Optional: If configured in Vite / Supabase
   # VITE_SUPABASE_URL=...
   # VITE_SUPABASE_ANON_KEY=...
   ```

4. **Run Locally**
   Start the development server:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000`.

## 📂 Project Structure

- **`App.tsx`**: Main application logic, handling the AudioContext, WebSocket connection to Gemini, and state management.
- **`prompts.ts`**: Contains the complex system instructions for the AI, including language-specific rules and operational protocols.
- **`services/`**:
  - `calendlyService.ts`: Handles API interactions for checking slots and booking appointments.
  - `storageService.ts`: Manages local settings and Supabase persistence.
- **`components/`**: UI components for the phone interface, calendar, and settings panels.
- **`i18n.ts`**: UI translation strings.

## 🧩 Usage Guide

1. **Onboarding**: On first launch, use the **Onboarding Wizard** to set up your clinic's details, services, and working hours.
2. **Connecting**: Click the **Call** button to initialize the WebSocket connection with Gemini.
3. **Interaction**: Speak naturally. The agent will respond in the configured language, check your defined schedule for availability, and can book slots if you provide a name and email.
4. **Settings**: Access the dashboard (via the gear icon) to update services or check logs.

## ⚠️ Important Notes

- **Audio Permissions**: The app requires microphone access. Ensure your browser permissions are granted.
- **Live API Costs**: This project uses the Gemini Multimodal Live API, which may incur costs based on usage duration.
