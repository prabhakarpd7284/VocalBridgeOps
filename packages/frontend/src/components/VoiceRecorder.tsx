/**
 * Voice Recorder Component
 * Uses browser-native Web Speech API for STT/TTS (FREE, no external APIs needed!)
 * Records audio for backend storage/audit while transcribing in real-time
 */

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2, Volume2, VolumeX } from 'lucide-react';

interface VoiceRecorderProps {
  sessionId: string;
  onTranscriptReceived: (transcript: string) => void;
  onResponseReceived: (response: string) => void;
  disabled?: boolean;
}

// Check browser support
const SpeechRecognition =
  (window as any).SpeechRecognition ||
  (window as any).webkitSpeechRecognition;

const isSpeechRecognitionSupported = !!SpeechRecognition;

export default function VoiceRecorder({
  sessionId,
  onTranscriptReceived,
  onResponseReceived,
  disabled = false,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Initialize speech recognition
  useEffect(() => {
    if (!isSpeechRecognitionSupported) {
      setError('Speech recognition not supported in this browser. Try Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setTranscript(transcript);

      // Send transcript to backend immediately
      handleTranscript(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setError(`Recognition error: ${event.error}`);
      setIsRecording(false);
      setIsProcessing(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      setTranscript('');

      // Start audio recording for storage
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Upload audio for storage/audit (optional)
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAudioForStorage(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;

      // Start speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }

      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Failed to access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    setIsProcessing(true);
  };

  const uploadAudioForStorage = async (audioBlob: Blob) => {
    // Optional: Upload audio for backend storage/audit
    // This is just for record-keeping, transcription already done in browser
    try {
      const apiKey = localStorage.getItem('apiKey');
      if (!apiKey) return;

      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('transcript', transcript);

      await fetch(`/api/v1/sessions/${sessionId}/voice/store-audio`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
        },
        body: formData,
      });
    } catch (err) {
      console.warn('Failed to store audio:', err);
      // Don't throw - this is optional
    }
  };

  const handleTranscript = async (transcriptText: string) => {
    try {
      const apiKey = localStorage.getItem('apiKey');
      if (!apiKey) {
        throw new Error('Not authenticated');
      }

      // Send transcript to backend (no audio processing needed!)
      const response = await fetch(`/api/v1/sessions/${sessionId}/voice/transcript`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `voice_${Date.now()}`,
        },
        body: JSON.stringify({
          transcript: transcriptText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || 'Failed to process message');
      }

      const data = await response.json();

      // Notify parent of transcript
      onTranscriptReceived(transcriptText);

      // Notify parent of response
      onResponseReceived(data.message.content);

      // Speak the response using browser TTS
      speakResponse(data.message.content);

    } catch (err) {
      console.error('Failed to process transcript:', err);
      setError((err as Error).message || 'Failed to process message');
    } finally {
      setIsProcessing(false);
    }
  };

  const speakResponse = (text: string) => {
    if (!window.speechSynthesis) {
      console.warn('Speech synthesis not supported');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  if (!isSpeechRecognitionSupported) {
    return (
      <div className="text-center text-red-600 text-sm">
        <p>Voice features require Chrome, Edge, or Safari.</p>
        <p className="text-xs mt-1">Speech Recognition API not available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-3">
      <div className="flex items-center space-x-2">
        {/* Recording button */}
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled || isProcessing}
          className={`p-3 rounded-full transition-colors ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
              : isProcessing
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
          title={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isRecording ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>

        {/* Stop speaking button */}
        {isSpeaking && (
          <button
            type="button"
            onClick={stopSpeaking}
            className="p-2 rounded-full bg-orange-600 hover:bg-orange-700 text-white"
            title="Stop speaking"
          >
            <VolumeX className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Status text */}
      <div className="text-center">
        {isRecording && (
          <span className="text-sm text-red-600 font-medium">🎤 Listening...</span>
        )}
        {isProcessing && (
          <span className="text-sm text-gray-600">Processing...</span>
        )}
        {isSpeaking && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <Volume2 className="w-4 h-4" />
            Speaking...
          </span>
        )}
        {transcript && !isRecording && !isProcessing && (
          <span className="text-xs text-gray-500">"{transcript}"</span>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="text-sm text-red-600 text-center max-w-xs">
          {error}
        </div>
      )}

      {/* Browser info */}
      <div className="text-xs text-gray-400 text-center">
        Using browser voice (no external APIs needed)
      </div>
    </div>
  );
}
