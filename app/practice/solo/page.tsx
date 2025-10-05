"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  RotateCcw,
  ArrowLeft,
  BarChart3,
  Edit3,
  Smile,
  AlertCircle,
  Trophy,
} from "lucide-react"
import Link from "next/link"

// Import the new AI analysis and speech recognition services
import { aiAnalysis, type SpeechAnalysis } from "@/lib/ai-analysis"
import { speechRecognition, type SpeechMetrics } from "@/lib/speech-recognition"
import { db } from "@/lib/database"

export default function SoloPracticePage() {
  const [currentStep, setCurrentStep] = useState<"setup" | "topic-selection" | "preparation" | "speaking" | "feedback">(
    "setup",
  )
  const [speakingTime, setSpeakingTime] = useState([2])
  const [isRecording, setIsRecording] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [isMicOn, setIsMicOn] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [preparationTime, setPreparationTime] = useState(60)
  const [currentTopic, setCurrentTopic] = useState("")
  const [liveFeedback, setLiveFeedback] = useState<string[]>([])

  // Update the state to include real analysis
  const [speechMetrics, setSpeechMetrics] = useState<SpeechMetrics | null>(null)
  const [analysisResult, setAnalysisResult] = useState<SpeechAnalysis | null>(null)
  const [isEndingSession, setIsEndingSession] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [sessionData, setSessionData] = useState({
  mediapipe_data: {
    session_duration: 0,
    good_posture_seconds: 0,
    hand_gestures_seconds: 0,
    speaking_seconds: 0
  },
  text_chunks: []
})
const [finalReport, setFinalReport] = useState("")
const [sessionScores, setSessionScores] = useState<{
  total_score:number;
  posture_score: number;
  gesture_score: number;
  speaking_score: number;
} | null>(null)
// ...existing code...
  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
// ...existing code...
  const topics = [
    "The impact of social media on modern communication",
    "Why learning a new language benefits your career",
    "The importance of work-life balance in today's world",
    "How technology is changing the way we learn",
    "The role of creativity in problem-solving",
  ]

  const feedbackMessages = [
    "Great eye contact! Keep it up.",
    "Try to reduce filler words like 'um' and 'uh'",
    "Your posture looks confident",
    "Consider speaking a bit louder",
    "Nice hand gestures - they support your message",
    "Take a brief pause to emphasize key points",
  ]

  const [selectedTopicType, setSelectedTopicType] = useState<"ai" | "custom" | null>(null)
  const [customTopic, setCustomTopic] = useState("")
  const [aiTopics, setAiTopics] = useState<string[]>([])
  const [selectedAiTopic, setSelectedAiTopic] = useState("")
  const [isLoadingTopics, setIsLoadingTopics] = useState(false)

  // Update the live feedback generation to use AI
  useEffect(() => {
    if (currentStep === "speaking" && isRecording) {
      const feedbackInterval = setInterval(() => {
        const feedback = aiAnalysis.generateLiveFeedback()
        setLiveFeedback((prev) => {
          const newFeedback = [...prev, feedback.message]
          return newFeedback.slice(-3) // Keep only last 3 feedback items
        })
      }, 8000)

      return () => clearInterval(feedbackInterval)
    }
  }, [currentStep, isRecording])

  useEffect(() => {
    if (timeRemaining > 0) {
      timerRef.current = setTimeout(() => {
        setTimeRemaining(timeRemaining - 1)
      }, 1000)
    } else if (timeRemaining === 0 && currentStep === "preparation") {
      setCurrentStep("speaking")
      setTimeRemaining(speakingTime[0] * 60)
    } else if (timeRemaining === 0 && currentStep === "speaking") {
      handleStopRecording()
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [timeRemaining, currentStep, speakingTime])

  // Add this useEffect after the existing useEffects
  useEffect(() => {
    if (currentStep === "speaking" && !isRecording) {
      // Auto-start recording when speaking step begins
      startRecording()
    }
  }, [currentStep])

  // Add these useEffect hooks after line 74 (after the existing useEffects)

// 1. Cleanup when component unmounts
useEffect(() => {
  return () => {
    // Cleanup media devices when component unmounts
    stopMediaDevices()
    // Also cleanup speech recognition
    if (speechRecognition) {
      speechRecognition.stopRecording()
    }
  }
}, [])

// 2. Cleanup when user navigates away or leaves the page
useEffect(() => {
  const handleBeforeUnload = () => {
    stopMediaDevices()
    if (speechRecognition) {
      speechRecognition.stopRecording()
    }
  }

  const handleVisibilityChange = () => {
    if (document.hidden && isRecording) {
      // Stop recording if user switches tabs or minimizes window
      handleStopRecording()
    }
  }

  const handlePopState = () => {
    // Handle browser back/forward buttons
    stopMediaDevices()
  }

  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('popstate', handlePopState)

  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('popstate', handlePopState)
  }
}, [isRecording])

// 3. Cleanup when switching between steps
useEffect(() => {
  if (currentStep !== "speaking" && mediaStreamRef.current) {
    // Stop media devices when leaving speaking step
    stopMediaDevices()
  }
}, [currentStep])

// 4. Cleanup timer when component unmounts or dependencies change
useEffect(() => {
  return () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null;
    }
  }
}, [])

  // Update the generateRandomTopic function to use AI
  const generateRandomTopic = async () => {
    try {
      const topics = await aiAnalysis.generateTopics("Everyday Conversations", 1)
      setCurrentTopic(topics[0] || "Describe your ideal weekend")
    } catch (error) {
      console.error("Error generating topic:", error)
      const fallbackTopics = [
        "Describe your ideal weekend",
        "What's the most interesting place you've visited?",
        "How has technology changed communication?",
        "What skill would you like to learn and why?",
        "Describe a person who has influenced your life",
      ]
      setCurrentTopic(fallbackTopics[Math.floor(Math.random() * fallbackTopics.length)])
    }
  }

  // Update the startPreparation function
  const startTopicSelection = () => {
    setCurrentStep("topic-selection")
  }

  const generateAITopics = async () => {
    setIsLoadingTopics(true)
    try {
      const topics = await aiAnalysis.generateTopics("Public Speaking", 5)
      setAiTopics(topics)
    } catch (error) {
      console.error("Error generating topics:", error)
      const fallbackTopics = [
        "The impact of social media on modern communication",
        "Why learning a new language benefits your career",
        "The importance of work-life balance in today's world",
        "How technology is changing the way we learn",
        "The role of creativity in problem-solving",
      ]
      setAiTopics(fallbackTopics)
    } finally {
      setIsLoadingTopics(false)
    }
  }

  const proceedToPreparation = () => {
    if (selectedTopicType === "ai" && selectedAiTopic) {
      setCurrentTopic(selectedAiTopic)
    } else if (selectedTopicType === "custom" && customTopic.trim()) {
      setCurrentTopic(customTopic.trim())
    }
    setCurrentStep("preparation")
    setTimeRemaining(60)
  }

  // Update the startRecording function to initialize camera and MediaPipe
  const startRecording = async () => {
    try {
      // Request camera and microphone permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      })
      mediaStreamRef.current = stream

      // Set the video stream to the video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      // Initialize speech recognition
      await speechRecognition.initialize()
      await speechRecognition.startRecording(stream)

      setIsRecording(true)
      setCurrentStep("speaking")
      setTimeRemaining(speakingTime[0] * 60)

      // Auto-start MediaPipe analysis
      setTimeout(() => {
        const iframe = document.querySelector('iframe[title="MediaPipe Analysis"]') as HTMLIFrameElement
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ action: "startAnalysis" }, "*")
        }
      }, 1000)
    } catch (error) {
      console.error("Error starting recording:", error)
      alert(
        "Camera and microphone access is required for the speaking session. Please allow permissions and try again.",
      )
    }
  }
  // Add function to stop media devices
  const stopMediaDevices = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop()
      })
      mediaStreamRef.current = null
    }
  }
  // Add this function after the stopMediaDevices function around line 281
const collectSessionDataAndGenerateReport = async () => {
  try {
    // Get session data from iframe
    const iframe = document.querySelector('iframe[title="MediaPipe Analysis"]') as HTMLIFrameElement
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ action: "getSessionData" }, "*")
    }

    // Listen for session data from iframe
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === "sessionData") {
        const data = event.data.data
        
        // Send data to backend
        const response = await fetch("http://localhost:8000/submit-session-data", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mediapipe_data: {
              session_duration: data.sessionDuration,
              good_posture_seconds: data.goodPostureSeconds,
              hand_gestures_seconds: data.handGesturesSeconds,
              speaking_seconds: data.speakingSeconds
            },
            text_chunks: data.textChunks
          })
        })

        if (response.ok) {
          const result = await response.json()
          setFinalReport(result.report)
          // Store the session scores
          setSessionScores({
            total_score:result.session_summary.total_score,
            posture_score: result.session_summary.posture_score,
            gesture_score: result.session_summary.gesture_score,
            speaking_score: result.session_summary.speaking_score
          })
        } else {
          console.error("Failed to generate report")
        }
        
        window.removeEventListener("message", handleMessage)
      }
    }

    window.addEventListener("message", handleMessage)
  } catch (error) {
    console.error("Error generating report:", error)
  }
}
// Add this function after collectSessionDataAndGenerateReport
const downloadReport = () => {
  const reportContent = `
Speech Analysis Report
======================

Session Topic: ${currentTopic}
Duration: ${speechMetrics?.duration || 0} seconds

AI-Generated Analysis:
${finalReport}

Performance Metrics:
- Overall Score: ${analysisResult?.overallScore || 'N/A'}
- Voice Clarity: ${analysisResult?.voiceClarity || 'N/A'}
- Body Language: ${analysisResult?.bodyLanguage || 'N/A'}
- Confidence: ${analysisResult?.confidence || 'N/A'}

Strengths:
${analysisResult?.strengths?.map(s => `- ${s}`).join('\n') || 'N/A'}

Areas for Improvement:
${analysisResult?.improvements?.map(i => `- ${i}`).join('\n') || 'N/A'}

Generated on: ${new Date().toLocaleString()}
  `

  const blob = new Blob([reportContent], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `speech-analysis-${new Date().toISOString().split('T')[0]}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
  const handleStopRecording = async () => {
  setIsEndingSession(true) // Show spinner immediately
  setIsRecording(false)
  stopMediaDevices()
  
  // Show spinner for at least 3 seconds
  setTimeout(() => {
    setIsEndingSession(false)
  }, 6000)
  
  // Add a small delay before starting the analysis
  setTimeout(async () => {
    setIsAnalyzing(true)
    
    try {
      // Get speech metrics
      const metrics = speechRecognition.stopRecording()
      setSpeechMetrics(metrics)

      // Analyze speech with AI
      const analysis = await aiAnalysis.analyzeSpeech(metrics.transcript, metrics.duration, {
        fillerWordCount: metrics.fillerWordCount,
        averageVolume: metrics.averageVolume,
        eyeContactPercentage: metrics.eyeContactPercentage,
        gestureCount: metrics.gestureCount,
      })
      setAnalysisResult(analysis)

      // Collect session data and generate report
      await collectSessionDataAndGenerateReport()

      // Save session to MongoDB backend
      try {
        await db.createSession({
          title: `Solo Practice: ${currentTopic.substring(0, 50)}...`,
          content: currentTopic,
          duration: metrics.duration,
          feedback: {
            overallScore: analysis.overallScore,
            clarity: analysis.voiceClarity,
            pace: analysis.pacingScore,
            confidence: analysis.confidence,
            suggestions: [...analysis.strengths, ...analysis.improvements],
          },
        })
      } catch (dbError) {
        console.error("Error saving session:", dbError)
      }
    } catch (error) {
      console.error("Error analyzing speech:", error)
      // Fallback analysis
      setAnalysisResult({
        overallScore: 75,
        voiceClarity: 80,
        confidence: 70,
        bodyLanguage: 75,
        eyeContact: 75,
        grammarScore: 85,
        vocabularyScore: 80,
        pacingScore: 75,
        volumeScore: 70,
        strengths: ["Clear articulation", "Good content structure", "Appropriate speaking pace"],
        improvements: ["Reduce filler words", "Maintain more eye contact", "Use more varied vocabulary"],
        recommendation:
          "Focus on practicing without filler words and maintaining consistent eye contact with your audience.",
      })
    } finally {
      setIsAnalyzing(false)
      setCurrentStep("feedback")
    }
  }, 500) // Small delay before analysis starts

  if (timerRef.current) {
    clearTimeout(timerRef.current)
  }
}

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

const resetSession = () => {
  setCurrentStep("setup")
  setIsRecording(false)
  setTimeRemaining(0)
  setLiveFeedback([])
  setCurrentTopic("")
  setSessionData({
    mediapipe_data: {
      session_duration: 0,
      good_posture_seconds: 0,
      hand_gestures_seconds: 0,
      speaking_seconds: 0
    },
    text_chunks: []
  })
  setFinalReport("")
  setSessionScores(null) // Reset session scores

  // Stop media devices when resetting
  stopMediaDevices()
}

  if (currentStep === "setup") {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b">
          <div className="container mx-auto px-4 py-4 flex items-center">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-4">Solo Practice Session</h1>
              <p className="text-gray-600">Practice with our AI virtual audience and get real-time feedback</p>
            </div>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Session Setup</CardTitle>
                <CardDescription>Configure your practice session preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-3">Speaking Duration</label>
                  <div className="space-y-3">
                    <Slider
                      value={speakingTime}
                      onValueChange={setSpeakingTime}
                      max={10}
                      min={1}
                      step={0.5}
                      className="w-full"
                    />
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>1 min</span>
                      <span className="font-medium">{speakingTime[0]} minutes</span>
                      <span>10 min</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Video className="w-5 h-5 text-blue-600" />
                      <span className="font-medium">Camera</span>
                    </div>
                    <Button
                      variant={isCameraOn ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIsCameraOn(!isCameraOn)}
                    >
                      {isCameraOn ? "On" : "Off"}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Mic className="w-5 h-5 text-green-600" />
                      <span className="font-medium">Microphone</span>
                    </div>
                    <Button variant={isMicOn ? "default" : "outline"} size="sm" onClick={() => setIsMicOn(!isMicOn)}>
                      {isMicOn ? "On" : "Off"}
                    </Button>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">What to expect:</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• You'll get 1 minute to prepare after receiving your topic</li>
                    <li>• Real-time feedback will appear during your speech</li>
                    <li>• AI will analyze your voice, posture, and expressions</li>
                    <li>• Detailed report will be generated after completion</li>
                  </ul>
                </div>

                <Button
                  onClick={startTopicSelection}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  size="lg"
                >
                  Start Practice Session
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (currentStep === "topic-selection") {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b">
          <div className="container mx-auto px-4 py-4 flex items-center">
            <Button variant="ghost" size="sm" onClick={() => setCurrentStep("setup")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Setup
            </Button>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-4">Choose Your Speaking Topic</h1>
              <p className="text-gray-600">Select how you'd like to get your speaking topic</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <Card
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  selectedTopicType === "ai" ? "ring-2 ring-blue-500 bg-blue-50" : ""
                }`}
                onClick={() => {
                  setSelectedTopicType("ai")
                  if (aiTopics.length === 0) {
                    generateAITopics()
                  }
                }}
              >
                <CardHeader className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <BarChart3 className="w-8 h-8 text-blue-600" />
                  </div>
                  <CardTitle>AI Generated Topics</CardTitle>
                  <CardDescription>
                    Let our AI suggest engaging topics tailored for public speaking practice
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• Curated for speaking practice</li>
                    <li>• Varied difficulty levels</li>
                    <li>• Fresh topics every time</li>
                    <li>• Optimized for 2-10 minute speeches</li>
                  </ul>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  selectedTopicType === "custom" ? "ring-2 ring-purple-500 bg-purple-50" : ""
                }`}
                onClick={() => setSelectedTopicType("custom")}
              >
                <CardHeader className="text-center">
                  <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Edit3 className="w-8 h-8 text-purple-600" />
                  </div>
                  <CardTitle>Custom Topic</CardTitle>
                  <CardDescription>Enter your own topic or practice a specific speech you're preparing</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• Practice specific presentations</li>
                    <li>• Work on personal interests</li>
                    <li>• Prepare for real events</li>
                    <li>• Complete creative control</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            {selectedTopicType === "ai" && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Select an AI Generated Topic</CardTitle>
                  <CardDescription>Choose from these carefully crafted speaking topics</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingTopics ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">Generating topics...</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {aiTopics.map((topic, index) => (
                        <div
                          key={index}
                          className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                            selectedAiTopic === topic ? "bg-blue-50 border-blue-500" : "hover:bg-gray-50"
                          }`}
                          onClick={() => setSelectedAiTopic(topic)}
                        >
                          <p className="font-medium">{topic}</p>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        onClick={generateAITopics}
                        disabled={isLoadingTopics}
                        className="w-full mt-4"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Generate New Topics
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {selectedTopicType === "custom" && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Enter Your Custom Topic</CardTitle>
                  <CardDescription>Write the topic or question you'd like to speak about</CardDescription>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    placeholder="e.g., The benefits of renewable energy, My experience learning a new skill, Why teamwork is essential in the workplace..."
                    className="w-full p-4 border rounded-lg resize-none h-32 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-gray-500">{customTopic.length}/200 characters</span>
                    {customTopic.length > 200 && <span className="text-sm text-red-500">Topic too long</span>}
                  </div>
                </CardContent>
              </Card>
            )}

            <Button
              onClick={proceedToPreparation}
              disabled={
                !selectedTopicType ||
                (selectedTopicType === "ai" && !selectedAiTopic) ||
                (selectedTopicType === "custom" && (!customTopic.trim() || customTopic.length > 200))
              }
              className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
              size="lg"
            >
              {selectedTopicType === "ai" && selectedAiTopic
                ? "Start with Selected Topic"
                : selectedTopicType === "custom" && customTopic.trim()
                  ? "Start with Custom Topic"
                  : "Select a Topic to Continue"}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (currentStep === "preparation") {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center">
            <div className="mb-8">
              <Badge className="mb-4 bg-orange-100 text-orange-700">Preparation Time</Badge>
              <div className="text-6xl font-bold text-orange-600 mb-4">{formatTime(timeRemaining)}</div>
              <Progress value={((60 - timeRemaining) / 60) * 100} className="h-2 mb-6" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Your Speaking Topic</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg mb-6">
                  <p className="text-lg font-medium text-gray-800">{currentTopic}</p>
                </div>

                <div className="text-left space-y-3">
                  <h4 className="font-medium">Preparation Tips:</h4>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• Think about your main points (2-3 key ideas)</li>
                    <li>• Consider examples or stories to support your points</li>
                    <li>• Plan a strong opening and closing</li>
                    <li>• Take deep breaths and visualize success</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

if (currentStep === "speaking") {
  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* End Session Spinner Overlay - Analytics Style */}
      {isEndingSession && (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center fixed inset-0 z-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Ending session and preparing your analysis...</p>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-4">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-4 bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center space-x-4">
            <Badge className="bg-red-600 text-white">
              <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></div>
              LIVE
            </Badge>
            <div className="text-2xl font-bold text-gray-900">{formatTime(timeRemaining)}</div>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant={isMicOn ? "default" : "destructive"} size="sm" onClick={() => setIsMicOn(!isMicOn)}>
              {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </Button>
            <Button
              variant={isCameraOn ? "default" : "destructive"}
              size="sm"
              onClick={() => setIsCameraOn(!isCameraOn)}
            >
              {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleStopRecording}
              disabled={isEndingSession}
            >
              {isEndingSession ? "Ending..." : "Stop Session"}
            </Button>
          </div>
        </div>


          {/* Topic Reminder */}
          <div className="mb-4">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <p className="text-lg font-medium text-blue-900">{currentTopic}</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-200px)]">
            {/* Left Side - Video Only */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="bg-gray-800 text-white p-3">
                <h3 className="text-lg font-semibold">Live Video</h3>
              </div>
              <div className="p-4 h-full flex items-center justify-center">
                {/* Video Container */}
                <div className="w-full max-w-md aspect-video bg-gray-800 rounded-lg overflow-hidden">
                  <video 
                    ref={videoRef}
                    autoPlay 
                    playsInline 
                    muted
                    className="w-full h-full object-cover transform scale-x-[-1]"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                </div>
              </div>
            </div>

            {/* Right Side - Analysis and Feedback */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
              <div className="bg-gray-800 text-white p-3">
                <h3 className="text-lg font-semibold">AI Analysis & Feedback</h3>
              </div>
              <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {/* WebSocket Status */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">🎤 Speech Recognition Status</h4>
                  <div id="websocket-status" className="text-blue-800 text-sm">
                    Initializing speech recognition...
                  </div>
                </div>

                {/* MediaPipe Analysis Results */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-2">📹 Body Language Analysis</h4>
                  <div id="mediapipe-feedback" className="text-green-800 text-sm min-h-[120px]">
                    Video analysis will appear here...
                  </div>
                </div>

                {/* Live Feedback */}
                {liveFeedback.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-900 mb-2">💡 Live Tips</h4>
                    <div className="space-y-2">
                      {liveFeedback.map((feedback, index) => (
                        <div
                          key={index}
                          className="text-yellow-800 text-sm p-2 bg-yellow-100 rounded animate-fade-in"
                        >
                          {feedback}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* MediaPipe Analysis iframe - Hidden but functional */}
                <iframe
                  srcDoc={`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Real-time Speech Recognition and Text-to-Speech</title>
                        <script src="https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js"></script>
                        <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
                        <script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"></script>
                    </head>
                    <body style="margin: 0; padding: 0;">
                        <video class="input_video" autoplay playsinline style="display: none;"></video>
                        <canvas class="output_canvas" width="640px" height="480px" style="display: none;"></canvas>

                        <script>
                            const videoElement = document.getElementsByClassName('input_video')[0];
                            const canvasElement = document.getElementsByClassName('output_canvas')[0];
                            const canvasCtx = canvasElement.getContext('2d');
                            let ws;
                            let recognition;
                            let sessionId;
                            let sessionStartTime;
                            
                            // Frontend storage for text chunks
                            let textChunks = [];
                            
                            // MediaPipe data tracking
                            let mediaPipeData = {
                                goodPostureSeconds: 0,
                                handGesturesSeconds: 0,
                                speakingSeconds: 0,
                                totalFrames: 0,
                                goodPostureFrames: 0,
                                handGesturesFrames: 0,
                                speakingFrames: 0,
                                lastFrameTime: 0
                            };

                            function resetMediaPipeData() {
                                mediaPipeData = {
                                    goodPostureSeconds: 0,
                                    handGesturesSeconds: 0,
                                    speakingSeconds: 0,
                                    totalFrames: 0,
                                    goodPostureFrames: 0,
                                    handGesturesFrames: 0,
                                    speakingFrames: 0,
                                    lastFrameTime: 0
                                };
                                textChunks = [];
                            }

                            function updateParentStatus(message) {
                                try {
                                    const parentStatus = window.parent.document.getElementById('websocket-status');
                                    if (parentStatus) {
                                        parentStatus.innerHTML = message;
                                    }
                                } catch (e) {
                                    console.log('Could not update parent status:', e);
                                }
                            }

                            function updateParentFeedback(feedbackText) {
                                try {
                                    const parentFeedback = window.parent.document.getElementById('mediapipe-feedback');
                                    if (parentFeedback) {
                                        parentFeedback.innerHTML = feedbackText;
                                    }
                                } catch (e) {
                                    console.log('Could not update parent feedback:', e);
                                }
                            }

                            function generateSessionId() {
                                return Date.now().toString() + Math.random().toString(36).substr(2, 9);
                            }

                            function startRecognition() {
                                if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
                                    updateParentStatus('Speech recognition not supported. Use Chrome or Edge.');
                                    return;
                                }

                                if (recognition) {
                                    try {
                                        recognition.stop();
                                        recognition = null;
                                    } catch (e) {
                                        console.log('Error stopping existing recognition:', e);
                                    }
                                }

                                const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
                                recognition = new SpeechRecognition();
                                recognition.continuous = true;
                                recognition.interimResults = true;
                                recognition.lang = 'en-US';
                                recognition.maxAlternatives = 1;

                                let isRestarting = false;

                                recognition.onstart = () => {
                                    console.log('Speech recognition started');
                                    updateParentStatus('🎤 Speech recognition active. Speak naturally.');
                                    isRestarting = false;
                                };

                                recognition.onresult = (event) => {
                                    try {
                                        let transcript = '';
                                        let isFinal = false;
                                        
                                        for (let i = event.resultIndex; i < event.results.length; i++) {
                                            const result = event.results[i];
                                            transcript += result[0].transcript;
                                            if (result.isFinal) {
                                                isFinal = true;
                                            }
                                        }
                                        
                                        if (isFinal && transcript.trim()) {
                                            currentTranscript = transcript.trim();
                                            console.log('Final transcript:', currentTranscript);
                                            
                                            if (ws && ws.readyState === WebSocket.OPEN) {
                                                ws.send(currentTranscript);
                                            } else {
                                                updateParentStatus('📝 You said: ' + currentTranscript);
                                            }
                                        }
                                    } catch (error) {
                                        console.error('Speech recognition result error:', error);
                                    }
                                };

                                recognition.onerror = (event) => {
                                    console.error('Speech recognition error:', event.error);
                                    
                                    switch(event.error) {
                                        case 'not-allowed':
                                            updateParentStatus('❌ Microphone access denied. Please refresh and allow permissions.');
                                            break;
                                        case 'network':
                                            updateParentStatus('❌ Network error. Check your connection.');
                                            break;
                                        case 'no-speech':
                                            console.log('No speech detected, will restart...');
                                            break;
                                        case 'aborted':
                                            console.log('Speech recognition aborted');
                                            return;
                                        case 'audio-capture':
                                            updateParentStatus('❌ Microphone not found. Please check your microphone.');
                                            break;
                                        default:
                                            updateParentStatus('❌ Speech recognition error: ' + event.error);
                                    }
                                };

                                recognition.onend = () => {
                                    console.log('Speech recognition ended');
                                    
                                    if (ws && ws.readyState === WebSocket.OPEN && !isRestarting) {
                                        isRestarting = true;
                                        setTimeout(() => {
                                            if (isRestarting && ws && ws.readyState === WebSocket.OPEN) {
                                                try {
                                                    startRecognition();
                                                } catch (error) {
                                                    console.log('Failed to restart recognition:', error);
                                                    isRestarting = false;
                                                }
                                            }
                                        }, 1000);
                                    }
                                };

                                try {
                                    recognition.start();
                                } catch (error) {
                                    console.error('Error starting recognition:', error);
                                    updateParentStatus('❌ Failed to start speech recognition. Please refresh.');
                                }
                            }

                            async function autoStart() {
                                sessionId = generateSessionId();
                                sessionStartTime = Date.now();
                                resetMediaPipeData();
                                
                                if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
                                    updateParentStatus('❌ Speech recognition not supported. Try Chrome or Edge.');
                                    camera.start();
                                    return;
                                }

                                try {
                                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                                    stream.getTracks().forEach(track => track.stop());
                                    console.log('Microphone permission granted');
                                } catch (error) {
                                    updateParentStatus('❌ Microphone access required. Please allow permissions and refresh.');
                                    camera.start();
                                    return;
                                }
                                
                                camera.start();
                                
                                try {
                                    ws = new WebSocket('ws://127.0.0.1:8000/ws/audio');
                                    
                                    let currentTranscript = '';
                                    let connectionTimeout = setTimeout(() => {
                                        if (ws && ws.readyState === WebSocket.CONNECTING) {
                                            ws.close();
                                            console.warn('WebSocket connection timeout');
                                            updateParentStatus('⚠️ Backend unavailable. Continuing with video analysis only.');
                                            startRecognition();
                                        }
                                    }, 5000);
                                    
                                    ws.onopen = () => {
                                        clearTimeout(connectionTimeout);
                                        console.log('WebSocket connected successfully');
                                        startRecognition();
                                        updateParentStatus('✅ Connected! Speak naturally.');
                                    };
                                    
                                    ws.onmessage = (event) => {
                                        try {
                                            if (currentTranscript) {
                                                textChunks.push({
                                                    text: currentTranscript,
                                                    response: event.data,
                                                    timestamp: Date.now()
                                                });
                                            }
                                            updateParentStatus('🤖 AI: ' + event.data);
                                        } catch (error) {
                                            console.error('WebSocket message error:', error);
                                        }
                                    };
                                    
                                    ws.onerror = (event) => {
                                        clearTimeout(connectionTimeout);
                                        console.error('WebSocket error:', event);
                                        updateParentStatus('⚠️ Backend connection failed. Continuing with video analysis only.');
                                        startRecognition();
                                    };

                                    ws.onclose = (event) => {
                                        clearTimeout(connectionTimeout);
                                        console.log('WebSocket closed:', event.code, event.reason);
                                        if (recognition) {
                                            try {
                                                recognition.stop();
                                                recognition = null;
                                            } catch (e) {
                                                console.log('Error stopping recognition on close:', e);
                                            }
                                        }
                                    };
                                    
                                } catch (error) {
                                    console.warn('WebSocket creation failed:', error);
                                    updateParentStatus('⚠️ Backend unavailable. Continuing with video analysis only.');
                                    startRecognition();
                                }
                            }

                            window.addEventListener('message', (event) => {
                              if (event.data.action === 'getSessionData') {
                                const sessionDuration = (Date.now() - sessionStartTime) / 1000;
                                const frameRate = 30;
                                
                                const sessionData = {
                                  sessionDuration: sessionDuration,
                                  goodPostureSeconds: (mediaPipeData.goodPostureFrames / frameRate),
                                  handGesturesSeconds: (mediaPipeData.handGesturesFrames / frameRate),
                                  speakingSeconds: (mediaPipeData.speakingFrames / frameRate),
                                  textChunks: textChunks
                                };
                                
                                window.parent.postMessage({
                                  type: 'sessionData',
                                  data: sessionData
                                }, '*');
                              }
                            });

                            const holistic = new Holistic({
                                locateFile: (file) => \`https://cdn.jsdelivr.net/npm/@mediapipe/holistic/\${file}\`
                            });

                            holistic.setOptions({
                                modelComplexity: 1,
                                smoothLandmarks: true,
                                enableSegmentation: false,
                                refineFaceLandmarks: true,
                                minDetectionConfidence: 0.5,
                                minTrackingConfidence: 0.5
                            });

                            holistic.onResults(results => {
                                mediaPipeData.totalFrames++;
                                
                                let feedback = [];

                                // Posture Analysis
                                if (results.poseLandmarks) {
                                    const leftShoulder = results.poseLandmarks[11];
                                    const rightShoulder = results.poseLandmarks[12];
                                    if (leftShoulder && rightShoulder) {
                                        const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y);
                                        if (shoulderTilt <= 0.05) {
                                            feedback.push("✅ <strong>Excellent posture!</strong> Keep it up.");
                                            mediaPipeData.goodPostureFrames++;
                                        } else {
                                            feedback.push("� <strong>Posture tip:</strong> Try to keep your shoulders level.");
                                        }
                                    } else {
                                        feedback.push("📹 <strong>Position tip:</strong> Step back a bit for better posture detection.");
                                    }
                                } else {
                                    feedback.push("🔍 <strong>Detection:</strong> Checking for body position...");
                                }

                                // Hand Gestures
                                const handsVisible = results.leftHandLandmarks || results.rightHandLandmarks;
                                if (handsVisible) {
                                    feedback.push("👋 <strong>Great gestures!</strong> Your hands are enhancing your message.");
                                    mediaPipeData.handGesturesFrames++;
                                } else {
                                    feedback.push("🤲 <strong>Gesture tip:</strong> Use hand movements to emphasize your points.");
                                }

                                // Speaking Detection
                                if (results.faceLandmarks) {
                                    const upperLip = results.faceLandmarks[13];
                                    const lowerLip = results.faceLandmarks[14];
                                    if (upperLip && lowerLip) {
                                        const mouthOpen = (lowerLip.y - upperLip.y) > 0.015;
                                        if (mouthOpen) {
                                            feedback.push("🗣️ <strong>Good articulation!</strong> Keep speaking clearly.");
                                            mediaPipeData.speakingFrames++;
                                        } else {
                                            feedback.push("🎤 <strong>Volume tip:</strong> Make sure you're speaking audibly.");
                                        }
                                    } else {
                                        feedback.push("👤 <strong>Face detection:</strong> Analyzing facial expressions...");
                                    }
                                } else {
                                    feedback.push("🔎 <strong>Face detection:</strong> Looking for facial cues...");
                                }

                                updateParentFeedback(feedback.join("<br><br>"));
                            });

                            const camera = new Camera(videoElement, {
                                onFrame: async () => {
                                    await holistic.send({ image: videoElement });
                                },
                                width: 640,
                                height: 480
                            });

                            setTimeout(autoStart, 1000);
                        </script>
                    </body>
                    </html>
                  `}
                  className="w-0 h-0 border-0 opacity-0 pointer-events-none"
                  title="MediaPipe Analysis"
                />
              </div>
            </div>

          </div>
        </div>
      </div>
    )
  }

  if (currentStep === "feedback") {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">Session Complete</h1>
            <div className="flex items-center space-x-2">
              <Button variant="outline" onClick={downloadReport} disabled={!finalReport}>
                Download Report
              </Button>
              <Button variant="outline" onClick={resetSession}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Practice Again
              </Button>
              <Link href="/dashboard">
                <Button>Back to Dashboard</Button>
              </Link>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-3xl font-bold mb-2">Great Job!</h2>
              <p className="text-gray-600">Here's your detailed performance analysis</p>
            </div>

            {isAnalyzing && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Analyzing your speech...</p>
              </div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card>
                <CardContent className="p-6 text-center">
                  {analysisResult && (
                    <>
                      <div className="text-3xl font-bold text-blue-600 mb-2">{sessionScores?.total_score||"🕒"}</div>
                      <div className="text-sm text-gray-600">Overall Score</div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">
                    {sessionScores?.posture_score || '🕒'}
                  </div>
                  <div className="text-sm text-gray-600">Posture Score</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-purple-600 mb-2">
                    {sessionScores?.gesture_score || '🕒'}
                  </div>
                  <div className="text-sm text-gray-600">Gesture Score</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-orange-600 mb-2">
                    {sessionScores?.speaking_score || '🕒'}
                  </div>
                  <div className="text-sm text-gray-600">Speaking Score</div>
                </CardContent>
              </Card>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-green-600">
                    <Smile className="w-5 h-5 mr-2" />
                    Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {analysisResult?.strengths.map((strength, index) => (
                      <li key={index} className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                        <div>
                          <div className="font-medium">{strength}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-orange-600">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    Areas for Improvement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {analysisResult?.improvements.map((improvement, index) => (
                      <li key={index} className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
                        <div>
                          <div className="font-medium">{improvement}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-8">
              <CardHeader>
                <CardTitle>Detailed Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Grammar & Vocabulary</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Grammar accuracy</span>
                        <span className="text-sm font-medium">88%</span>
                      </div>
                      <Progress value={88} className="h-2" />
                      <div className="flex justify-between">
                        <span className="text-sm">Vocabulary richness</span>
                        <span className="text-sm font-medium">82%</span>
                      </div>
                      <Progress value={82} className="h-2" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-3">Delivery Metrics</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Speaking pace</span>
                        <span className="text-sm font-medium">85%</span>
                      </div>
                      <Progress value={85} className="h-2" />
                      <div className="flex justify-between">
                        <span className="text-sm">Volume consistency</span>
                        <span className="text-sm font-medium">90%</span>
                      </div>
                      <Progress value={90} className="h-2" />
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">AI Recommendation</h4>
                  <p className="text-blue-800 text-sm">
                    {analysisResult?.recommendation ||
                      "Focus on reducing filler words in your next practice session. Try the 'pause and breathe' technique when you feel the urge to say 'um' or 'uh'. Your content structure was excellent - keep building on that foundation!"}
                  </p>
                </div>
              </CardContent>
            </Card>
            {finalReport && (
              <Card className="mt-8">
                <CardHeader>
                  <CardTitle>AI-Generated Comprehensive Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <pre className="whitespace-pre-wrap text-sm text-blue-900 font-mono">
                      {finalReport}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
