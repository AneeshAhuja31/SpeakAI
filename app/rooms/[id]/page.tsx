"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useParams } from "next/navigation"
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Users,
  Clock,
  MessageSquare,
  Send,
  ArrowLeft,
  Play,
  SkipForward,
  Trophy,
  Star,
  Target,
  Eye,
  Volume2,
  Zap,
  Download,
  FileText
} from "lucide-react"
import Link from "next/link"
import { webrtcService } from "@/lib/webrtc"
import { roomManager, type Room, type Participant, type Feedback } from "@/lib/room-manager"
import { mediaPipeAnalyzer } from "@/lib/mediapipe-analyzer"

export default function RoomPage() {
  const params = useParams()
  const id = params?.id as string
  const [room, setRoom] = useState<Room | null>(null)
  function generateRandomId() {
    return "user-" + Math.random().toString(36).substr(2, 9)
  }

  const [currentUser] = useState(() => {
    // Persist per tab for refresh, but unique per tab
    let id = sessionStorage.getItem("user_id")
    if (!id) {
      id = generateRandomId()
      sessionStorage.setItem("user_id", id)
    }
    return { id, name: "You" }
  })  
  const [reportGenerationAttempts, setReportGenerationAttempts] = useState<Set<string>>(new Set())

  const [reportNotification, setReportNotification] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [micEnabled, setMicEnabled] = useState(true)
  const [feedbackMessage, setFeedbackMessage] = useState("")
  const [feedbackType, setFeedbackType] = useState<"positive" | "constructive" | "question">("constructive")
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [preparationTime, setPreparationTime] = useState(0)
  const [sessionPhase, setSessionPhase] = useState<"waiting" | "preparation" | "speaking" | "feedback" | "completed">(
    "waiting",
  )
  const [currentTopic, setCurrentTopic] = useState("")
  const [showReport, setShowReport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [liveFeedbacks, setLiveFeedbacks] = useState<Feedback[]>([])
  const [personalReport, setPersonalReport] = useState<any>(null)
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const [liveMediaPipe, setLiveMediaPipe] = useState({
  eyeContactPercentage: 0,
  gestureCount: 0,
  confidenceScore: 0,
})
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null) // Add this state
  const [mediaPipeData, setMediaPipeData] = useState({
    session_duration: 0,
    good_posture_seconds: 0,
    hand_gestures_seconds: 0,
    speaking_seconds: 0,
    total_frames: 0
  })
  const [speakingStartTime, setSpeakingStartTime] = useState<number>(0)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [participantReports, setParticipantReports] = useState<Map<string, any>>(new Map())
  const [liveFeedbackForSpeaker, setLiveFeedbackForSpeaker] = useState<string[]>([])
  const [speakingTimer, setSpeakingTimer] = useState<NodeJS.Timeout | null>(null) // Add this line
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  
  // Add message listener for MediaPipe data
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'mediapipeData') {
        setMediaPipeData(event.data.data)
      }
    }
    
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Add MediaPipe functions
  const initializeMediaPipeForSpeaker = () => {
    if (!room?.current_speaker || room.current_speaker !== currentUser.id) return
    
    setIsAnalyzing(true)
    setSpeakingStartTime(Date.now())
    
    // Reset MediaPipe data for new speaker
    setMediaPipeData({
      session_duration: 0,
      good_posture_seconds: 0,
      hand_gestures_seconds: 0,
      speaking_seconds: 0,
      total_frames: 0
    })
    
    // Initialize MediaPipe tracking
    const iframe = document.querySelector('#mediapipe-iframe') as HTMLIFrameElement
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ action: "startAnalysis" }, "*")
    }
  }
  
  const stopMediaPipeAnalysis = async () => {
    if (!isAnalyzing) return
    
    setIsAnalyzing(false)
    const sessionDuration = (Date.now() - speakingStartTime) / 1000
    
    // Get final MediaPipe data
    const iframe = document.querySelector('#mediapipe-iframe') as HTMLIFrameElement
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ action: "getSessionData" }, "*")
    }
    
    // Collect peer feedbacks for current speaker
    const speakerFeedbacks = liveFeedbacks.filter(
      feedback => feedback.to_participant === room?.current_speaker
    )
    
    // Generate individual report
    // try {
    //   const response = await fetch("http://localhost:8000/submit-group-member-data", {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({
    //       participant_id: room?.current_speaker,
    //       room_id: room?.id,
    //       mediapipe_data: {
    //         session_duration: sessionDuration,
    //         good_posture_seconds: mediaPipeData.good_posture_seconds,
    //         hand_gestures_seconds: mediaPipeData.hand_gestures_seconds,
    //         speaking_seconds: mediaPipeData.speaking_seconds
    //       },
    //       peer_feedbacks: speakerFeedbacks
    //     })
    //   })
      
    //   if (response.ok) {
    //     const result = await response.json()
    //     setParticipantReports(prev => new Map(prev.set(room?.current_speaker || "", result)))
    //   }
    // } catch (error) {
    //   console.error("Error generating speaker report:", error)
    // }
  }  
  // ...existing code...

// ...existing code...

// Update the generateSpeakerReport function to properly wait for MediaPipe data
const generateSpeakerReport = async (speakerId: string, roomId: string) => {
  const reportKey = `${speakerId}-${roomId}`
  
  // ✅ Check if we already generated or are generating this report
  if (reportGenerationAttempts.has(reportKey)) {
    console.log(`📊 Report already being generated for ${speakerId}, skipping...`)
    return
  }
  
  // ✅ Check if report already exists
  if (participantReports.has(speakerId)) {
    console.log(`📊 Report already exists for ${speakerId}, skipping...`)
    return
  }
  
  // ✅ Mark as being generated
  setReportGenerationAttempts(prev => new Set(prev.add(reportKey)))
  
  console.log(`📊 Generating report for speaker: ${speakerId}`)
  
  try {
    // ✅ Only generate report if current user is the speaker (to avoid multiple clients generating)
    if (speakerId !== currentUser.id) {
      console.log(`📊 Skipping report generation - not the current user (${speakerId} vs ${currentUser.id})`)
      return
    }
    
    // ✅ FIX: Ensure we're getting the latest MediaPipe data
    let finalMediaPipeData = { ...mediaPipeData }
    
    // Get final MediaPipe data from iframe if current user is speaking
    if (speakerId === currentUser.id) {
      const iframe = document.querySelector('#mediapipe-iframe') as HTMLIFrameElement
      if (iframe?.contentWindow) {
        console.log("📊 Requesting final MediaPipe data...")
        iframe.contentWindow.postMessage({ action: "getSessionData" }, "*")
        
        // Wait for MediaPipe data to be updated
        await new Promise((resolve) => {
          const handleMediaPipeUpdate = (event: MessageEvent) => {
            if (event.data.type === 'mediapipeData') {
              console.log("📊 Received final MediaPipe data:", event.data.data)
              finalMediaPipeData = event.data.data
              window.removeEventListener('message', handleMediaPipeUpdate)
              resolve(event.data.data)
            }
          }
          window.addEventListener('message', handleMediaPipeUpdate)
          
          // Timeout after 3 seconds
          setTimeout(() => {
            window.removeEventListener('message', handleMediaPipeUpdate)
            console.log("⚠️ MediaPipe data timeout, using current data")
            resolve(finalMediaPipeData)
          }, 3000)
        })
      }
    }
    
    const sessionDuration = (Date.now() - speakingStartTime) / 1000
    
    // ✅ FIX: Get current liveFeedbacks state value
    const currentLiveFeedbacks = liveFeedbacks
    console.log("📊 Current liveFeedbacks:", currentLiveFeedbacks)
    
    // Collect peer feedbacks for current speaker
    const speakerFeedbacks = currentLiveFeedbacks.filter(
      feedback => feedback.to_participant === speakerId
    )
    
    console.log(`📊 Submitting data for ${speakerId}:`, {
      session_duration: sessionDuration,
      good_posture_seconds: finalMediaPipeData.good_posture_seconds,
      hand_gestures_seconds: finalMediaPipeData.hand_gestures_seconds,
      speaking_seconds: finalMediaPipeData.speaking_seconds,
      peer_feedbacks_count: speakerFeedbacks.length,
      peer_feedbacks: speakerFeedbacks
    })
    
    // Generate individual report (async, non-blocking)
    const response = await fetch("http://localhost:8000/submit-group-member-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: speakerId,
        room_id: roomId,
        mediapipe_data: {
          session_duration: sessionDuration,
          good_posture_seconds: finalMediaPipeData.good_posture_seconds || 0,
          hand_gestures_seconds: finalMediaPipeData.hand_gestures_seconds || 0,
          speaking_seconds: finalMediaPipeData.speaking_seconds || 0
        },
        peer_feedbacks: speakerFeedbacks
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      console.log(`✅ Report generated successfully for ${speakerId}`)
      console.log("📊 Report result:", result)
      
      // Update participant reports state
      setParticipantReports(prev => new Map(prev.set(speakerId, result)))
      
      // Show notification to user if it's their report
      if (speakerId === currentUser.id) {
        console.log("🎉 Your report is ready!")
        setReportNotification(speakerId)
      }
    } else {
      console.error(`❌ Failed to generate report for ${speakerId}:`, response.status)
      const errorText = await response.text()
      console.error("Error details:", errorText)
      
      // ✅ Remove from attempts if failed so it can be retried
      setReportGenerationAttempts(prev => {
        const newSet = new Set(prev)
        newSet.delete(reportKey)
        return newSet
      })
    }
  } catch (error) {
    console.error(`❌ Error generating report for ${speakerId}:`, error)
    
    // ✅ Remove from attempts if failed so it can be retried
    setReportGenerationAttempts(prev => {
      const newSet = new Set(prev)
      newSet.delete(reportKey)
      return newSet
    })
  } finally {
    // Stop MediaPipe analysis if it's the current user
    if (speakerId === currentUser.id) {
      setIsAnalyzing(false)
    }
  }
}
  

  useEffect(() => {
    if (!id) return

    let isCleanedUp = false
    let currentSocket: WebSocket | null = null
    let connectionAttempted = false

    const loadRoom = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const response = await fetch(`http://localhost:8000/api/rooms/${id}`)
        
        if (!response.ok) {
          throw new Error(`Room not found: ${response.status}`)
        }
        
        const data = await response.json()
        
        if (!data.room) {
          setError("Room not found")
          return
        }

        const foundRoom = data.room
        const transformedRoom: Room = {
          id: foundRoom.id,
          name: foundRoom.name,
          host_id: foundRoom.host_id || "host-id",
          topic_category: foundRoom.topic_category,
          time_per_speaker: foundRoom.time_per_speaker,
          max_participants: foundRoom.max_participants,
          total_duration: foundRoom.time_per_speaker * foundRoom.max_participants,
          is_public: foundRoom.is_public,
          description: foundRoom.description,
          status: foundRoom.status,
          created_at: foundRoom.created_at,
          participants: foundRoom.participants || [],
          speaking_order: foundRoom.speaking_order || [],
          session_feedbacks: [],
          live_feedbacks: [],
        }

        setRoom(transformedRoom)
        setIsHost(foundRoom.host_id === currentUser.id)

      } catch (error) {
        console.error("Error loading room:", error)
        setError("Failed to load room. Please try again.")
      } finally {
        setIsLoading(false)
      }
    }

    const connectWebSocket = () => {
      if (isCleanedUp || connectionAttempted || currentSocket) {
        console.log("🚫 WebSocket connection prevented - already attempted or exists")
        return null
      }
      
      connectionAttempted = true
      console.log(`🔗 Connecting to WebSocket: ws://localhost:8000/ws/room/${id}`)
      
      const ws = new WebSocket(`ws://localhost:8000/ws/room/${id}`)
      currentSocket = ws
      
      ws.onopen = () => {
        if (isCleanedUp) {
          console.log("🧹 Connection opened but component unmounted, closing...")
          ws.close()
          return
        }
        
        console.log("✅ Connected to room WebSocket")
        setSocket(ws)
        setError(null)
        
        // Set the WebSocket for WebRTC service
        webrtcService.setSignalingSocket(ws)
        
        // Send user information immediately
        ws.send(JSON.stringify({
          type: "set_participant_name",
          user_id: currentUser.id,
          user_name: currentUser.name
        }))
      }

      ws.onmessage = async (event) => {
        if (isCleanedUp) return
        
        try {
          const message = JSON.parse(event.data)
          console.log("📨 Received WebSocket message:", message.type, message)
          
          switch (message.type) {
            case "send_feedback":
              console.log("📝 Received feedback:", message.feedback)
              // ✅ FIX: Update liveFeedbacks state when feedback is received
              setLiveFeedbacks(prev => [...prev, message.feedback])
              break
            case "room_state":
              console.log("📊 Room state received, participants:", message.room.participants?.length)
              console.log("🆔 Received user_id from backend:", message.user_id)
              setRoom(message.room)

              // ✅ CRITICAL: Set the user ID for WebRTC service
              if (message.user_id) {
                console.log("🆔 Setting currentUserId and WebRTC user ID to:", message.user_id)
                setCurrentUserId(message.user_id)
                webrtcService.setCurrentUserId(message.user_id)

                // Use message.user_id directly here!
                if (message.room.participants && message.room.participants.length > 1 && message.user_id) {
                  const otherParticipants = message.room.participants.filter(
                    (p: any) => (p.user_id || p.id) !== message.user_id
                  )
                  otherParticipants.forEach(async (participant: any, index: number) => {
                    const participantId = participant.user_id || participant.id
                    setTimeout(async () => {
                      try {
                        console.log("🔗 [NEW JOINER] Creating offer for existing participant:", participantId)
                        await webrtcService.createOffer(participantId)
                      } catch (error) {
                        console.error("Failed to create offer for existing participant (new joiner):", error)
                      }
                    }, 2000 + (index * 1000))
                  })
                }
              } else {
                console.error("❌ No user_id received from backend!")
              }
              
              const currentParticipant = message.room.participants?.find(
                (p: any) => (p.user_id || p.id) === message.user_id
              )
              if (currentParticipant?.is_host) {
                setIsHost(true)
              }
              
              // Initialize WebRTC after UI has time to render
              setTimeout(async () => {
                if (!isCleanedUp) {
                  try {
                    console.log("🎥 Initializing WebRTC after room state...")
                    await initializeWebRTC()
                  } catch (error) {
                    console.error("WebRTC initialization failed:", error)
                  }
                }
              }, 1000)
              break

            case "participant_joined":
              console.log("👥 Participant joined. Total:", message.room.participants?.length)
              setRoom(message.room)
              
              if (message.new_participant && message.new_participant.user_id !== currentUserId && currentUserId) {
                const newParticipantId = message.new_participant.user_id
                console.log("🔗 Initiating WebRTC connection:", currentUserId, "->", newParticipantId)
                
                setTimeout(async () => {
                  try {
                    console.log("🎯 Creating offer for participant:", newParticipantId)
                    await webrtcService.createOffer(newParticipantId)
                  } catch (error) {
                    console.error("Failed to create offer for new participant:", error)
                  }
                }, 3000)
              }
              break
              
            case "participant_disconnected":
              console.log("👋 Participant left. Total:", message.room.participants?.length)
              setRoom(message.room)
              break
              
            case "participant_updated":
              setRoom(message.room)
              break
              
            case "session_started":
              console.log("📍 Session started, entering preparation phase")
              console.log("📍 Room data:", message.room)
              console.log("📍 Current speaker:", message.room.current_speaker)
              
              setRoom(message.room)
              setSessionPhase("preparation")
              setPreparationTime(10)
              generateTopic()
              
              // FIXED: Only current speaker sends preparation_complete
              console.log("📍 Starting 60-second preparation countdown")
              let countdown = 10
              setPreparationTime(countdown)
              
              const timerInterval = setInterval(() => {
                countdown -= 1
                setPreparationTime(countdown)
                console.log(`📍 Preparation countdown: ${countdown} seconds remaining`)
                
                if (countdown <= 0) {
                  clearInterval(timerInterval)
                  console.log("📍 Preparation time complete!")
                  
                  // ONLY CURRENT SPEAKER SENDS preparation_complete
                  if (message.room.current_speaker === currentUser.id) {
                    console.log("📍 I'm the current speaker, sending preparation_complete")
                    if (ws && ws.readyState === WebSocket.OPEN) {
                      const prepCompleteMessage = {
                        type: "preparation_complete",
                        room_id: message.room.id
                      }
                      console.log("📍 Sending message:", prepCompleteMessage)
                      ws.send(JSON.stringify(prepCompleteMessage))
                    }
                  } else {
                    console.log("📍 I'm not the current speaker, waiting for speaking phase")
                  }
                }
              }, 1000)
              break

            // Update the speaking_started case in the WebSocket message handler
            case "speaking_started":
              console.log("📍 Speaking phase started - received from backend")
              console.log("📍 Current speaker from message:", message.room.current_speaker)
              console.log("📍 Room time per speaker:", message.room.time_per_speaker)
              
              // CRITICAL: Update room state FIRST
              setRoom(message.room)
              setSessionPhase("speaking")
              setPreparationTime(0)
              
              // FIXED: Start timer with room data from message (not state)
              if (message.room.current_speaker && message.room.time_per_speaker) {
                console.log(`📍 Starting speaking timer for: ${message.room.current_speaker}`)
                console.log(`📍 Timer duration: ${message.room.time_per_speaker} minutes`)
                
                // Use room data from message directly, not from state
                const speakingTimeSeconds = message.room.time_per_speaker * 60
                setTimeRemaining(speakingTimeSeconds)
                
                // Clear any existing timer
                if (speakingTimer) {
                  clearInterval(speakingTimer)
                  setSpeakingTimer(null)
                }
                
                // Initialize MediaPipe for current speaker
                if (message.room.current_speaker === currentUser.id) {
                  console.log("🎥 Current user is speaking - initializing MediaPipe")
                  setTimeout(() => {
                    initializeMediaPipeForSpeaker()
                  }, 2000)
                } else {
                  console.log("👁️ Current user is not speaking - will watch")
                }
                
                // Start countdown timer
                const newTimer = setInterval(() => {
                  setTimeRemaining((prevTime) => {
                    const newTime = prevTime - 1
                    console.log(`⏰ Speaking time remaining: ${newTime} seconds`)
                    
                    if (newTime <= 0) {
                      console.log("⏰ Speaking time ended, finishing speech")
                      clearInterval(newTimer)
                      setSpeakingTimer(null)
                      
                      // ✅ FIX: Generate report for current speaker when timer ends
                      if (message.room.current_speaker === currentUser.id) {
                        console.log("📊 Current user's time ended - generating report")
                        // Generate report asynchronously without blocking
                        generateSpeakerReport(message.room.current_speaker, message.room.id)
                      }
                      
                      // Only current speaker sends finished message
                      if (message.room.current_speaker === currentUser.id) {
                        console.log("📤 Current user finishing speech, sending message")
                        setTimeout(() => {
                          if (ws && ws.readyState === WebSocket.OPEN) {
                            console.log("📤 About to send speaker_finished message via ws")
                            const finishedMessage = {
                              type: "speaker_finished",
                              participant_id: message.room.current_speaker,
                              room_id: message.room.id
                            }
                            console.log("📤 Message being sent:", finishedMessage)
                            ws.send(JSON.stringify(finishedMessage))
                          } else {
                            console.error("❌ WebSocket ws not available for speaker_finished message")
                            console.error("❌ ws state:", ws?.readyState)
                          }
                        }, 100)
                      }
                      return 0
                    }
                    return newTime
                  })
                }, 1000)
                
                setSpeakingTimer(newTimer)
                console.log("✅ Speaking timer started successfully")
              } else {
                console.error("❌ Missing speaker or time data in speaking_started message")
              }
              break

// ...existing code...
            case "session_completed":
              console.log("📍 Session completed")
              setRoom(message.room)
              setSessionPhase("completed")
              setShowReport(true)
              break
              
            case "webrtc_offer":
              console.log("📞 Received WebRTC offer from:", message.from, "to:", message.to)
              if (!message.to || message.to === currentUserId || message.to === currentUser.id) {
                console.log("✅ Processing WebRTC offer from:", message.from)
                try {
                  await webrtcService.handleRemoteOffer(message.from, message.offer)
                  console.log("✅ Successfully handled offer from:", message.from)
                } catch (error) {
                  console.error("❌ Error handling offer:", error)
                }
              } else {
                console.log("⏭️ Skipping offer - not for us")
              }
              break

            case "webrtc_answer":
              console.log("📞 Received WebRTC answer from:", message.from)
              if (!message.to || message.to === currentUserId || message.to === currentUser.id) {
                console.log("✅ Processing WebRTC answer from:", message.from)
                webrtcService.handleAnswer(message.from, message.answer)
              }
              break

            case "webrtc_ice_candidate":
              console.log("🧊 Received ICE candidate from:", message.from)
              if (!message.to || message.to === currentUserId || message.to === currentUser.id) {
                console.log("✅ Processing ICE candidate from:", message.from)
                webrtcService.handleIceCandidate(message.from, message.candidate)
              }
              break
            // ...existing code...

            case "speaker_changed":
              console.log("📍 Speaker changed - new preparation phase")
              console.log("📍 New current speaker:", message.room.current_speaker)
              console.log("📍 Previous speaker should have finished")
              
              setRoom(message.room)
              setSessionPhase("preparation")
              
              // ✅ Generate report for previous speaker if they haven't got one yet
              // const previousSpeakerOrder = message.room.speaking_order || []
              // const newSpeakerIndex = previousSpeakerOrder.indexOf(message.room.current_speaker)
              // if (newSpeakerIndex > 0) {
              //   const previousSpeaker = previousSpeakerOrder[newSpeakerIndex - 1]
              //   if (previousSpeaker && !participantReports.has(previousSpeaker)) {
              //     console.log(`📊 Generating missing report for previous speaker: ${previousSpeaker}`)
              //     generateSpeakerReport(previousSpeaker, message.room.id)
              //   }
              // }
              
              // 30 seconds prep for next speaker
              console.log("📍 Starting 30-second next speaker preparation")
              let nextCountdown = 30
              setPreparationTime(nextCountdown)
              
              const nextTimerInterval = setInterval(() => {
                nextCountdown -= 1
                setPreparationTime(nextCountdown)
                console.log(`📍 Next speaker prep: ${nextCountdown} seconds remaining`)
                
                if (nextCountdown <= 0) {
                  clearInterval(nextTimerInterval)
                  console.log("📍 Next speaker preparation complete!")
                  
                  // ONLY NEW CURRENT SPEAKER SENDS preparation_complete
                  if (message.room.current_speaker === currentUser.id) {
                    console.log("📍 I'm the new current speaker, sending preparation_complete")
                    if (ws && ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({
                        type: "preparation_complete",
                        room_id: message.room.id
                      }))
                    }
                  } else {
                    console.log("📍 I'm not the new speaker, waiting")
                  }
                }
              }, 1000)
              break

            default:
              console.log(`❓ Unknown message type: ${message.type}`)
              break
          }
        } catch (error) {
          console.error("❌ Error handling WebSocket message:", error)
        }
      }

      ws.onclose = (event) => {
        if (isCleanedUp) return
        
        console.log("❌ WebSocket closed:", event.code, event.reason)
        setSocket(null)
        currentSocket = null
        connectionAttempted = false
        
        if (event.code !== 1000 && event.code !== 1001) {
          setError("Connection lost. Please refresh the page.")
        }
      }

      ws.onerror = (error) => {
        console.error("🚨 WebSocket error:", error)
        setError("Failed to connect to room")
        setSocket(null)
        currentSocket = null
        connectionAttempted = false
      }

      return ws
    }

    const initializeRoom = async () => {
      console.log("🚀 Starting room initialization...")
      
      await loadRoom()
      
      if (!isCleanedUp && !error) {
        console.log("📡 Room loaded successfully, connecting WebSocket...")
        
        setTimeout(() => {
          if (!isCleanedUp && !currentSocket) {
            connectWebSocket()
          }
        }, 100)
      }
    }

    initializeRoom()

    return () => {
      isCleanedUp = true
      console.log("🧹 Cleaning up room connection")
      if (speakingTimer) {
        clearInterval(speakingTimer)
        setSpeakingTimer(null)
      }
      if (currentSocket) {
        if (currentSocket.readyState === WebSocket.OPEN) {
          currentSocket.close(1000, "Component unmounting")
        }
        currentSocket = null
      }
      
      connectionAttempted = false
      setSocket(null)
      webrtcService.endCall()
      mediaPipeAnalyzer.stop()
    }
  }, [id, currentUser.id])

  // ✅ AUDIO FIX: Add click listener to enable audio on first user interaction
  useEffect(() => {
    const handleFirstUserInteraction = () => {
      enableAudioForAllVideos()
      // Remove listener after first interaction
      document.removeEventListener('click', handleFirstUserInteraction)
      document.removeEventListener('keydown', handleFirstUserInteraction)
    }

    document.addEventListener('click', handleFirstUserInteraction)
    document.addEventListener('keydown', handleFirstUserInteraction)

    return () => {
      document.removeEventListener('click', handleFirstUserInteraction)
      document.removeEventListener('keydown', handleFirstUserInteraction)
    }
  }, [])

  useEffect(() => {
  let interval: NodeJS.Timeout | null = null
  // Only poll if I'm the current speaker and in speaking phase
  if (room && room.current_speaker === currentUser.id && sessionPhase === "speaking") {
    interval = setInterval(() => {
      const analysis = mediaPipeAnalyzer.getCurrentAnalysis()
      setLiveMediaPipe({
      eyeContactPercentage: analysis.eyeContactPercentage ?? 0,
      gestureCount: analysis.gestureCount ?? 0,
      confidenceScore: analysis.confidenceScore ?? 0,
    })
    }, 500)
  } else {
    setLiveMediaPipe({
      eyeContactPercentage: 0,
      gestureCount: 0,
      confidenceScore: 0,
    })
  }
  return () => {
    if (interval) clearInterval(interval)
  }
}, [room?.current_speaker, sessionPhase, currentUser.id])

useEffect(() => {
  if (room && room.current_speaker !== currentUser.id) {
    mediaPipeAnalyzer.stop()
  }
}, [room?.current_speaker, sessionPhase, currentUser.id])

useEffect(() => {
  // Only initialize when local video is ready and user is the current speaker
  if (
    localVideoRef.current &&
    room?.current_speaker === currentUser.id &&
    sessionPhase === "speaking"
  ) {
    (async () => {
      if (localVideoRef.current) {
        await mediaPipeAnalyzer.initialize(localVideoRef.current)
        mediaPipeAnalyzer.startAnalysis()
      }
    })()
  }
}, [localVideoRef.current, room?.current_speaker, sessionPhase, currentUser.id])

useEffect(() => {
  if (participantReports.has(currentUser.id) && reportNotification !== currentUser.id) {
    setReportNotification(currentUser.id)
    
    // Auto-hide notification after 5 seconds
    setTimeout(() => {
      setReportNotification(null)
    }, 5000)
  }
}, [participantReports, currentUser.id])

  const initializeWebRTC = async () => {
  try {
    console.log("🎥 Starting WebRTC initialization...")
    
    const stream = await webrtcService.initializeLocalStream()
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
    }

    if (localVideoRef.current) {
      await mediaPipeAnalyzer.initialize(localVideoRef.current)
    }

    // ENHANCED: Better remote stream handler with DOM lookup
    webrtcService.onRemoteStreamAdded = (peerId: string, stream: MediaStream) => {
      console.log("🎥 Remote stream received from peer:", peerId)
      console.log("📺 Stream details:", {
        id: stream.id,
        active: stream.active,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
      })
      
      // Method 1: Try ref first
      let videoElement = remoteVideosRef.current.get(peerId)
      
      // Method 2: If ref not found, search DOM directly
      if (!videoElement) {
        console.log("🔍 Video element not found in ref, searching DOM...")
        const videoElements = document.querySelectorAll('video[data-peer-id]')
        for (const el of videoElements) {
          if (el.getAttribute('data-peer-id') === peerId) {
            videoElement = el as HTMLVideoElement
            console.log("✅ Found video element in DOM for peer:", peerId)
            // Update the ref for future use
            remoteVideosRef.current.set(peerId, videoElement)
            break
          }
        }
      }
      
      // Method 3: If still not found, try finding by key pattern
      if (!videoElement) {
        console.log("🔍 Searching for video element by pattern...")
        const allVideos = document.querySelectorAll('video')
        for (const video of allVideos) {
          // Skip local video
          if (video === localVideoRef.current) continue
          
          // Find video without srcObject (available for assignment)
          if (!video.srcObject) {
            videoElement = video as HTMLVideoElement
            console.log("✅ Found available video element for peer:", peerId)
            // Mark this element with peer ID and update ref
            videoElement.setAttribute('data-peer-id', peerId)
            remoteVideosRef.current.set(peerId, videoElement)
            break
          }
        }
      }
      
      if (videoElement) {
        console.log("📺 Assigning stream to video element for peer:", peerId)
        videoElement.srcObject = stream
        
        // ✅ AUDIO FIX: Ensure audio is enabled for remote streams
        videoElement.muted = false
        videoElement.volume = 1.0
        
        // Ensure video plays
        videoElement.play().then(() => {
          console.log("✅ Video playing successfully for peer:", peerId)
          console.log("🔊 Audio enabled for peer:", peerId, "- Audio tracks:", stream.getAudioTracks().length)
        }).catch(error => {
          console.error("❌ Error playing video for peer:", peerId, error)
          // Try again after a delay
          setTimeout(() => {
            videoElement.play().catch(e => console.error("❌ Retry failed:", e))
          }, 1000)
        })
      } else {
        console.error("❌ No video element found for peer:", peerId)
        console.log("Available refs:", Array.from(remoteVideosRef.current.keys()))
        console.log("Available DOM videos:", document.querySelectorAll('video').length)
        
        // Enhanced retry with DOM search
        let retryCount = 0
        const maxRetries = 10
        
        const retryAssignment = () => {
          // Search all video elements in DOM
          const allVideos = document.querySelectorAll('video')
          let foundElement = null
          
          for (const video of allVideos) {
            if (video === localVideoRef.current) continue
            if (!video.srcObject) {
              foundElement = video as HTMLVideoElement
              break
            }
          }
          
          if (foundElement) {
            console.log(`📺 Retry ${retryCount + 1} successful for peer:`, peerId)
            foundElement.setAttribute('data-peer-id', peerId)
            foundElement.srcObject = stream
            // ✅ AUDIO FIX: Ensure audio is enabled for remote streams  
            foundElement.muted = false
            foundElement.volume = 1.0
            remoteVideosRef.current.set(peerId, foundElement)
            foundElement.play().catch(error => console.error("❌ Retry play error:", error))
          } else if (retryCount < maxRetries) {
            retryCount++
            console.log(`🔄 Retry ${retryCount}/${maxRetries} for peer:`, peerId)
            setTimeout(retryAssignment, 500 * retryCount)
          } else {
            console.error("❌ Failed to assign stream after", maxRetries, "retries for peer:", peerId)
          }
        }
        
        setTimeout(retryAssignment, 500)
      }
    }
    
    webrtcService.onPeerDisconnected = (peerId: string) => {
      console.log("👋 Peer disconnected:", peerId)
      const videoElement = remoteVideosRef.current.get(peerId)
      if (videoElement) {
        videoElement.srcObject = null
        videoElement.removeAttribute('data-peer-id')
      }
      remoteVideosRef.current.delete(peerId)
    }
    
    console.log("✅ WebRTC initialization complete")
    
  } catch (error) {
    console.error("Failed to initialize WebRTC:", error)
    setError("Failed to initialize camera and microphone")
  }
}
  const toggleCamera = () => {
    const newState = !cameraEnabled
    setCameraEnabled(newState)
    webrtcService.toggleVideo(newState)
    if (socket && room) {
      socket.send(JSON.stringify({
        type: "toggle_camera",
        participant_id: currentUser.id,
        camera_enabled: newState
      }))
    }
  }

  const toggleMic = () => {
    const newState = !micEnabled
    setMicEnabled(newState)
    webrtcService.toggleAudio(newState)
    
    if (newState) {
      enableAudioForAllVideos()
    }
    
    if (socket && room) {
      socket.send(JSON.stringify({
        type: "toggle_mic",
        participant_id: currentUser.id,
        mic_enabled: newState
      }))
    }
  }

  // ✅ AUDIO FIX: Function to enable audio for all remote videos
  const enableAudioForAllVideos = () => {
    console.log("🔊 Enabling audio for all remote videos...")
    const allVideos = document.querySelectorAll('video[data-peer-id]')
    allVideos.forEach((video) => {
      const videoElement = video as HTMLVideoElement
      if (videoElement.srcObject) {
        videoElement.muted = false
        videoElement.volume = 1.0
        console.log("🔊 Audio enabled for video:", videoElement.getAttribute('data-peer-id'))
      }
    })
  }

  const startSession = () => {
    if (!room || !isHost || !socket) return

    socket.send(JSON.stringify({
      type: "start_session",
      room_id: room.id
    }))
  }

  const generateTopic = () => {
    const topics = {
      "Everyday Conversations": [
        "Describe your ideal weekend and why it appeals to you",
        "Talk about a skill you'd like to learn and your motivation",
        "Share your thoughts on the importance of friendship",
        "Discuss a memorable meal you've had and what made it special",
        "Explain a hobby that brings you joy and why you recommend it",
      ],
      "Business & Professional": [
        "Present your idea for improving workplace productivity",
        "Discuss the future of remote work in your industry",
        "Explain how to give effective feedback to colleagues",
        "Describe the qualities of a great leader",
        "Present a solution to a common workplace challenge",
      ],
      "Current Events & Debate": [
        "Argue for or against social media age restrictions",
        "Discuss the impact of AI on future job markets",
        "Present your views on sustainable transportation",
        "Debate the role of technology in education",
        "Discuss the importance of digital privacy in modern society",
      ],
    }

    const categoryTopics = topics[room?.topic_category as keyof typeof topics] || topics["Everyday Conversations"]
    const randomTopic = categoryTopics[Math.floor(Math.random() * categoryTopics.length)]
    setCurrentTopic(randomTopic)
  }

  const startSpeaking = (participantId?: string) => {
    if (!room) return

    const speakerId = participantId || room.current_speaker
    console.log(`🎤 Manual start speaking called for: ${speakerId}`)
    
    // This function is now mainly for MediaPipe initialization
    if (speakerId === currentUser.id) {
      console.log("🎥 Initializing MediaPipe for manual start")
      setTimeout(() => {
        initializeMediaPipeForSpeaker()
      }, 1000)
    }
  }

// ...existing code...

const endCurrentSpeech = async () => {
  if (!room) return

  console.log(`🏁 Manual end speech called for: ${room.current_speaker}`)
  
  // ✅ Generate report asynchronously (don't wait for it)
  if (room.current_speaker) {
    generateSpeakerReport(room.current_speaker, room.id)
  }
  
  // Send speaker finished message immediately
  if (room.current_speaker === currentUser.id && socket && socket.readyState === WebSocket.OPEN) {
    console.log("📤 Sending speaker_finished message manually")
    socket.send(JSON.stringify({
      type: "speaker_finished",
      participant_id: room.current_speaker,
      room_id: room.id
    }))
  }

  setTimeRemaining(0)
}

// ...existing code...

  const nextSpeaker = () => {
    if (!room || !socket) return

    socket.send(JSON.stringify({
      type: "next_speaker",
      room_id: room.id
    }))
  }


  // ✅ ENHANCED: Better debug function
const debugWebRTCConnections = () => {
  console.log("🔍 === WebRTC Debug Info ===")
  console.log("Current User ID:", currentUserId)
  console.log("Room Participants:", room?.participants?.map(p => ({ 
    id: p.user_id || p.id, 
    name: p.user_name || p.name 
  })))
  console.log("WebRTC Current User ID:", webrtcService.getCallState())
  console.log("WebRTC Peer Connections:", Array.from(webrtcService.getCallState().participants))
  console.log("Remote Streams:", Array.from(webrtcService.getCallState().remoteStreams.entries()))
  console.log("Video Elements:", Array.from(remoteVideosRef.current.entries()))
  console.log("Socket ready state:", socket?.readyState)
  console.log("=== End Debug Info ===")
}
  // Call this every 10 seconds for debugging
  useEffect(() => {
    const interval = setInterval(debugWebRTCConnections, 10000)
    return () => clearInterval(interval)
  }, [currentUserId, room])

  // Debug timer and session state
  useEffect(() => {
    console.log(`📍 TIMER DEBUG:`)
    console.log(`   - Session Phase: ${sessionPhase}`)
    console.log(`   - Time Remaining: ${timeRemaining}`)
    console.log(`   - Current Speaker: ${room?.current_speaker}`)
    console.log(`   - Is Current User: ${room?.current_speaker === currentUser.id}`)
    console.log(`   - Timer Running: ${!!speakingTimer}`)
  }, [sessionPhase, timeRemaining, room?.current_speaker, speakingTimer])

// ...existing code...

// ...existing code...

const sendFeedback = () => {
  if (!room || !feedbackMessage.trim() || !socket || !room.current_speaker) return

  const newFeedback: Feedback = {
    id: Date.now().toString(),
    from_participant: currentUser.id,
    from_name: currentUser.name,
    to_participant: room.current_speaker, // Now guaranteed to be string due to the guard above
    message: feedbackMessage,
    timestamp: new Date().toISOString(),
    type: feedbackType,
    session_phase: sessionPhase,
  }

  console.log("📝 Sending feedback:", newFeedback)

  // ✅ FIX: Update local state immediately
  setLiveFeedbacks(prev => [...prev, newFeedback])

  socket.send(JSON.stringify({
    type: "send_feedback",
    feedback: newFeedback
  }))

  setFeedbackMessage("")
}

// ...existing code...

// ...existing code...
    const downloadReport = (report: any) => {
    if (!report) return
    
    const reportContent = `
Group Speaking Session Report
=============================

Session Information:
- Room: ${room?.name || 'Unknown Room'}
- Date: ${new Date().toLocaleDateString()}
- Speaker: ${report.participant_id || 'Unknown'}
- Duration: ${Math.round(mediaPipeData.session_duration || 0)} seconds

Performance Scores:
===================
- Overall Score: ${report.scores?.overall_score || 'N/A'}%
- Posture Quality: ${report.scores?.posture_score || 'N/A'}%
- Hand Gestures: ${report.scores?.gesture_score || 'N/A'}%
- Speaking Activity: ${report.scores?.speaking_score || 'N/A'}%
- Peer Feedback Score: ${report.scores?.peer_feedback_score || 'N/A'}%

Peer Feedback Summary:
=====================
- Total Feedback Received: ${report.feedback_summary?.total_feedbacks || 0}
- Positive Comments: ${report.feedback_summary?.positive_count || 0}
- Constructive Comments: ${report.feedback_summary?.constructive_count || 0}

AI Analysis:
============
${report.report || 'No detailed analysis available'}

MediaPipe Technical Data:
========================
- Session Duration: ${mediaPipeData.session_duration || 0} seconds
- Good Posture Time: ${mediaPipeData.good_posture_seconds || 0} seconds
- Hand Gesture Time: ${mediaPipeData.hand_gestures_seconds || 0} seconds
- Speaking Activity Time: ${mediaPipeData.speaking_seconds || 0} seconds

Generated on: ${new Date().toLocaleString()}
Report ID: ${report.participant_id || 'unknown'}_${Date.now()}
    `
    
    const blob = new Blob([reportContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `group-speech-report-${report.participant_id || 'unknown'}-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
  const getPersonalReport = async () => {
    if (!room) {
      console.error("Cannot get personal report: room is null")
      return
    }
    
    try {
      const response = await fetch(`http://localhost:8000/api/rooms/${room.id}/reports/${currentUser.id}`)
      const report = await response.json()
      setPersonalReport(report)
    } catch (error) {
      console.error("Failed to load personal report:", error)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Room Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <Link href="/practice/group">
              <Button className="w-full">Browse Available Rooms</Button>
            </Link>
            <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
              Retry Loading
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading || !room) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading room...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/practice/group">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Rooms
            </Button>
          </Link>

          <div className="flex items-center space-x-4">
            <Badge variant="outline">Room: {room.id}</Badge>
            <Badge variant={room.status === "active" ? "default" : "secondary"}>
              {room.status === "waiting" ? "Waiting" : room.status === "active" ? "Live" : "Completed"}
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-2">
                    <Users className="w-5 h-5" />
                    <span>{room.name}</span>
                  </CardTitle>

                         

                  {sessionPhase === "speaking" && (
                    <div className="flex items-center space-x-2 text-red-600">
                      <Clock className="w-4 h-4" />
                      <span className="font-bold">Speaking: {formatTime(timeRemaining)}</span>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                {(sessionPhase === "preparation" || sessionPhase === "speaking") && currentTopic && (
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
                    <h3 className="font-medium text-blue-900 mb-2">Current Topic:</h3>
                    <p className="text-blue-800">{currentTopic}</p>
                  </div>
                )}

                <div className="grid gap-4 mb-6" style={{ 
                  gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, room.participants?.length || 1))}, 1fr)` 
                }}>
                  <div className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden">
                    <video 
                      ref={localVideoRef} 
                      autoPlay 
                      muted 
                      playsInline 
                      className="w-full h-full object-cover"
                      data-testid="local-video"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
                      You {room.current_speaker === currentUser.id && sessionPhase === "speaking" && "(Speaking)"}
                    </div>
                                        <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
                      You {room.current_speaker === currentUser.id && sessionPhase === "speaking" && "(Speaking)"}
                    </div>
                    {room.current_speaker === currentUser.id && sessionPhase === "speaking" && (
                      <div className="absolute top-2 left-2 right-2 bg-black/60 text-white px-3 py-2 rounded text-xs max-w-sm z-10">
                        <div id="camera-feedback" className="leading-tight">Starting analysis...</div>
                      </div>
                    )}
                    <div className="absolute bottom-2 right-2 flex space-x-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${micEnabled ? "bg-green-600" : "bg-red-600"}`}>
                        {micEnabled ? <Mic className="w-3 h-3 text-white" /> : <MicOff className="w-3 h-3 text-white" />}
                      </div>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${cameraEnabled ? "bg-green-600" : "bg-red-600"}`}>
                        {cameraEnabled ? <Video className="w-3 h-3 text-white" /> : <VideoOff className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  </div>

                  {room.participants && room.participants.length > 0 && (() => {
                    // Use currentUserId from state, which is set from the backend
                    return room.participants
                      .filter((p) => {
                        if (!p || !(p.user_id || p.id)) return false
                        const participantId = p.user_id || p.id
                        // Only filter out the participant whose ID matches currentUserId
                        return participantId !== currentUserId
                      })
                      .slice(0, 7)
                      .map((participant) => {
                        const participantId = participant.user_id || participant.id
                        const participantName = participant.user_name || participant.name || 'Participant'
                        return (
                          <div
                            key={`remote-${participantId}`}
                            className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden"
                          >
                            <video
                              ref={(el) => {
                                if (el && participantId) {
                                  el.setAttribute('data-peer-id', participantId)
                                  // DO NOT mute remote videos - we want to hear their audio
                                  el.muted = false
                                  // Set volume to full for audio
                                  el.volume = 1.0
                                  remoteVideosRef.current.set(participantId, el)
                                  const existingStream = webrtcService.getCallState().remoteStreams.get(participantId)
                                  // Only assign if not already set
                                  if (existingStream && el.srcObject !== existingStream) {
                                    el.srcObject = existingStream
                                    el.play().catch(error => {
                                      console.error("❌ Error playing existing stream:", error)
                                    })
                                  }
                                }
                              }}
                              autoPlay
                              playsInline
                              className="w-full h-full object-cover"
                              data-peer-id={participantId}
                            />
                            {/* Show a message if no stream */}
                            
                            <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
                              {participantName}{" "}
                              {room.current_speaker === participantId && sessionPhase === "speaking" && "(Speaking)"}
                              {participant.is_host && " (Host)"}
                            </div>
                            <div className="absolute bottom-2 right-2 flex space-x-1">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                participant.mic_enabled !== false ? "bg-green-600" : "bg-red-600"
                              }`}>
                                {participant.mic_enabled !== false ? (
                                  <Mic className="w-3 h-3 text-white" />
                                ) : (
                                  <MicOff className="w-3 h-3 text-white" />
                                )}
                              </div>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                participant.camera_enabled !== false ? "bg-green-600" : "bg-red-600"
                              }`}>
                                {participant.camera_enabled !== false ? (
                                  <Video className="w-3 h-3 text-white" />
                                ) : (
                                  <VideoOff className="w-3 h-3 text-white" />
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    })()
                  }
                </div>
                {reportNotification && (
  <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2">
    <Trophy className="w-5 h-5" />
    <span className="font-medium">Your performance report is ready!</span>
    <Button 
      variant="outline" 
      size="sm" 
      className="ml-2 bg-white text-green-600 hover:bg-gray-100"
      onClick={() => {
        setReportNotification(null)
        // Scroll to report section
        document.querySelector('[data-report-section]')?.scrollIntoView({ behavior: 'smooth' })
      }}
    >
      View Now
    </Button>
  </div>
)}
                
                {/* ADD PREPARATION PHASE HERE - BELOW THE VIDEO GRID */}
                {sessionPhase === "preparation" && (
                  <Card className="mb-6">
                    <CardContent className="text-center py-8">
                      <div className="mb-8">
                        <Badge className="mb-4 bg-orange-100 text-orange-700">Preparation Time</Badge>
                        <div className="text-6xl font-bold text-orange-600 mb-4">{formatTime(preparationTime)}</div>
                        <div className="w-full max-w-md mx-auto bg-gray-200 rounded-full h-3 mb-6">
                          <div 
                            className="bg-orange-600 h-3 rounded-full transition-all duration-1000" 
                            style={{width: `${Math.max(0, 100 - (preparationTime / 60) * 100)}%`}}
                          ></div>
                        </div>
                        <h2 className="text-2xl font-bold mb-4">
                          {room?.current_speaker === currentUser.id 
                            ? "Get Ready - You're Speaking Next!" 
                            : `${room?.participants.find(p => p.user_id === room?.current_speaker)?.user_name || 'Someone'} is preparing to speak`}
                          </h2>
                      </div>

                      

                      
                    </CardContent>
                  </Card>
                )}
                <div className="flex justify-center space-x-4">
                  <Button onClick={toggleMic} variant={micEnabled ? "default" : "destructive"} size="lg">
                    {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                  </Button>

                  <Button onClick={toggleCamera} variant={cameraEnabled ? "default" : "destructive"} size="lg">
                    {cameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                  </Button>

                  {isHost && sessionPhase === "waiting" && room && room.participants && room.participants.length > 0 && (
                    <Button onClick={startSession} className="bg-green-600 hover:bg-green-700" size="lg">
                      <Play className="w-5 h-5 mr-2" />
                      Start Session
                    </Button>
                  )}
                </div>
                {/* Individual Performance Report with Download */}
            {participantReports.has(currentUser.id) && (
              <Card className="mt-6" data-report-section>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center space-x-2">
                      <Trophy className="w-5 h-5 text-yellow-500" />
                      <span>Your Performance Report</span>
                      {reportNotification === currentUser.id && (
                        <Badge className="bg-green-500 animate-pulse">New!</Badge>
                      )}
                    </span>
                    <Button 
                      onClick={() => downloadReport(participantReports.get(currentUser.id))}
                      variant="outline"
                      size="sm"
                      className="flex items-center space-x-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Report</span>
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const report = participantReports.get(currentUser.id);
                    return (
                      <div className="space-y-6">
                        {/* Performance Scores Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center p-4 bg-blue-50 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">{report.scores.posture_score}%</div>
                            <div className="text-sm text-gray-600">Posture</div>
                          </div>
                          <div className="text-center p-4 bg-green-50 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">{report.scores.gesture_score}%</div>
                            <div className="text-sm text-gray-600">Gestures</div>
                          </div>
                          <div className="text-center p-4 bg-purple-50 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">{report.scores.speaking_score}%</div>
                            <div className="text-sm text-gray-600">Speaking</div>
                          </div>
                          <div className="text-center p-4 bg-orange-50 rounded-lg">
                            <div className="text-2xl font-bold text-orange-600">{report.scores.overall_score}%</div>
                            <div className="text-sm text-gray-600">Overall</div>
                          </div>
                        </div>
                        
                        {/* Peer Feedback Summary */}
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="font-semibold mb-3">Peer Feedback Summary</h4>
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                              <div className="text-lg font-bold text-green-600">
                                {report.feedback_summary.positive_count}
                              </div>
                              <div className="text-sm text-gray-600">Positive</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-orange-600">
                                {report.feedback_summary.constructive_count}
                              </div>
                              <div className="text-sm text-gray-600">Constructive</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-blue-600">
                                {report.feedback_summary.total_feedbacks}
                              </div>
                              <div className="text-sm text-gray-600">Total</div>
                            </div>
                          </div>
                        </div>
                        
                        {/* AI Analysis Report */}
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <h4 className="font-semibold mb-3 text-blue-900">AI Performance Analysis</h4>
                          <div className="text-sm text-blue-800 whitespace-pre-wrap leading-relaxed">
                            {report.report}
                          </div>
                        </div>
                        
                        {/* Technical Metrics */}
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="font-semibold mb-3">Technical Analysis Data</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <strong>Session Duration:</strong> {Math.round(mediaPipeData.session_duration || 0)}s
                            </div>
                            <div>
                              <strong>Good Posture Time:</strong> {Math.round(mediaPipeData.good_posture_seconds || 0)}s
                            </div>
                            <div>
                              <strong>Hand Gesture Time:</strong> {Math.round(mediaPipeData.hand_gestures_seconds || 0)}s
                            </div>
                            <div>
                              <strong>Speaking Activity:</strong> {Math.round(mediaPipeData.speaking_seconds || 0)}s
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex space-x-3 pt-4 border-t">
                          <Button
                            onClick={() => downloadReport(report)}
                            className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download Detailed Report
                          </Button>
                          
                          <Button
                            onClick={() => {
                              const dataStr = JSON.stringify(report, null, 2)
                              const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr)
                              const exportFileDefaultName = `speech-report-data-${new Date().toISOString().split("T")[0]}.json`
                              const linkElement = document.createElement("a")
                              linkElement.setAttribute("href", dataUri)
                              linkElement.setAttribute("download", exportFileDefaultName)
                              linkElement.click()
                            }}
                            variant="outline"
                            className="flex-1"
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Export Raw Data
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
                {/* Hidden MediaPipe iframe - only processes, doesn't display video */}
                {room.current_speaker === currentUser.id && sessionPhase === "speaking" && (
                  <iframe
                    id="mediapipe-iframe"
                    srcDoc={`
                      <!DOCTYPE html>
                      <html>
                      <head>
                        <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
                        <script src="https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js"></script>
                        <script src="https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js"></script>
                      </head>
                      <body>
                        <video class="input_video" style="display: none;" autoplay playsinline></video>
                        <canvas class="output_canvas" style="display: none;" width="640px" height="480px"></canvas>
                        
                        <script>
                          const videoElement = document.getElementsByClassName('input_video')[0];
                          const canvasElement = document.getElementsByClassName('output_canvas')[0];
                          const canvasCtx = canvasElement.getContext('2d');
                          
                          // MediaPipe data tracking
                          let mediaPipeData = {
                            goodPostureFrames: 0,
                            handGesturesFrames: 0,
                            speakingFrames: 0,
                            totalFrames: 0,
                            sessionStartTime: Date.now()
                          };

                          // Get camera stream
                          navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                            .then(stream => {
                              videoElement.srcObject = stream;
                              videoElement.onloadedmetadata = () => {
                                videoElement.play();
                              };
                            })
                            .catch(err => {
                              console.error('Camera access failed:', err);
                              updateParentFeedback('❌ Camera access failed');
                            });

                          // Initialize MediaPipe
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

                          // Real-time analysis processing
                          holistic.onResults(results => {
                            mediaPipeData.totalFrames++;
                            
                            let feedback = [];

                            // 1. POSTURE ANALYSIS
                            if (results.poseLandmarks) {
                              const leftShoulder = results.poseLandmarks[11];
                              const rightShoulder = results.poseLandmarks[12];
                              if (leftShoulder && rightShoulder) {
                                const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y);
                                if (shoulderTilt <= 0.05) {
                                  feedback.push("<strong>Posture:</strong> ✅");
                                  mediaPipeData.goodPostureFrames++;
                                } else {
                                  feedback.push("<strong>Posture:</strong> 🔴");
                                }
                              } else {
                                feedback.push("ℹ️ Stand further back to detect posture");
                              }
                            } else {
                              feedback.push("ℹ️ No pose detected for posture analysis");
                            }

                            // 2. HAND GESTURE ANALYSIS
                            const handsVisible = results.leftHandLandmarks || results.rightHandLandmarks;
                            if (handsVisible) {
                              feedback.push("<strong>Hand Gesture:</strong> ✅ ");
                              mediaPipeData.handGesturesFrames++;
                            } else {
                              feedback.push("<strong>Hand Gesture:</strong> 🔴");
                            }

                            // 3. SPEAKING DETECTION
                            if (results.faceLandmarks && results.faceLandmarks.length > 14) {
                              const upperLip = results.faceLandmarks[13];
                              const lowerLip = results.faceLandmarks[14];
                              if (upperLip && lowerLip) {
                                const mouthOpen = (lowerLip.y - upperLip.y) > 0.015;
                                if (mouthOpen) {
                                  feedback.push("<strong>Speaking:</strong> ✅ ");
                                  mediaPipeData.speakingFrames++;
                                } else {
                                  feedback.push("<strong>Speaking:</strong> 🔴");
                                }
                              } else {
                                feedback.push("ℹ️ No face detected for mouth analysis");
                              }
                            } else {
                              feedback.push("ℹ️ No face detected for mouth analysis");
                            }

                            // Update parent window feedback
                            updateParentFeedback(feedback.join("<br>"));
                          });

                          // Camera initialization
                          const camera = new Camera(videoElement, {
                            onFrame: async () => {
                              await holistic.send({ image: videoElement });
                            },
                            width: 640,
                            height: 480
                          });

                          // Auto-start camera
                          setTimeout(() => {
                            camera.start();
                            updateParentFeedback("Analysis started...");
                          }, 1000);

                          // Function to update parent window feedback
                          function updateParentFeedback(feedbackText) {
                            try {
                              const parentFeedback = window.parent.document.getElementById('camera-feedback');
                              if (parentFeedback) {
                                parentFeedback.innerHTML = feedbackText;
                              }
                            } catch (e) {
                              console.log('Could not update parent feedback:', e);
                            }
                          }
                          
                          // Message handlers for session data
                          window.addEventListener('message', (event) => {
                            if (event.data.action === 'getSessionData') {
                              const sessionDuration = (Date.now() - mediaPipeData.sessionStartTime) / 1000;
                              const frameRate = 30;
                              
                              window.parent.postMessage({
                                type: 'mediapipeData',
                                data: {
                                  session_duration: sessionDuration,
                                  good_posture_seconds: (mediaPipeData.goodPostureFrames / frameRate),
                                  hand_gestures_seconds: (mediaPipeData.handGesturesFrames / frameRate),
                                  speaking_seconds: (mediaPipeData.speakingFrames / frameRate)
                                }
                              }, '*');
                            }
                            
                            if (event.data.action === 'startAnalysis') {
                              mediaPipeData.sessionStartTime = Date.now();
                              mediaPipeData.goodPostureFrames = 0;
                              mediaPipeData.handGesturesFrames = 0;
                              mediaPipeData.speakingFrames = 0;
                              mediaPipeData.totalFrames = 0;
                              updateParentFeedback("Analysis restarted...");
                            }
                          });
                        </script>
                      </body>
                      </html>
                    `}
                    className="w-0 h-0 border-0 opacity-0 pointer-events-none"
                    title="MediaPipe Analysis"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Room Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Participants:</span>
                  <span className="font-medium">
                    {room.participants?.length || 0}/{room.max_participants}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Time per speaker:</span>
                  <span className="font-medium">{room.time_per_speaker} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Topic:</span>
                  <span className="font-medium text-sm">{room.topic_category}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Speaking Order</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {room.speaking_order?.map((participantId, index) => {
                    const participant = room.participants?.find((p) => 
                      p && ((p.user_id && p.user_id === participantId) || (p.id && p.id === participantId))
                    )
                    const isCurrent = room.current_speaker === participantId
                    const hasSpoken = participant?.has_spoken

                    if (!participant) return null

                    const displayName = participant.user_name || participant.name || 'Participant'

                    return (
                      <div
                        key={participantId}
                        className={`flex items-center space-x-3 p-2 rounded ${
                          isCurrent ? "bg-blue-100 border border-blue-300" : hasSpoken ? "bg-green-50" : "bg-gray-50"
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                            isCurrent
                              ? "bg-blue-600 text-white"
                              : hasSpoken
                                ? "bg-green-600 text-white"
                                : "bg-gray-400 text-white"
                          }`}
                        >
                          {index + 1}
                        </div>
                        <span className="flex-1">{displayName}</span>
                        {hasSpoken && (
                          <Badge variant="secondary" className="text-xs">
                            Done
                          </Badge>
                        )}
                        {isCurrent && <Badge className="text-xs">Speaking</Badge>}
                      </div>
                    )
                  }) || <p className="text-gray-500 text-sm">Speaking order will be set when session starts</p>}
                </div>
              </CardContent>
            </Card>

            {(sessionPhase === "speaking" || sessionPhase === "feedback") &&
              room.current_speaker !== currentUser.id && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center">
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Send Feedback
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex space-x-2">
                        <Button
                          variant={feedbackType === "positive" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFeedbackType("positive")}
                        >
                          👍 Positive
                        </Button>
                        <Button
                          variant={feedbackType === "constructive" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFeedbackType("constructive")}
                        >
                          💡 Improve
                        </Button>
                        <Button
                          variant={feedbackType === "question" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFeedbackType("question")}
                        >
                          ❓ Question
                        </Button>
                      </div>
                      <Input
                        placeholder={`Type ${feedbackType} feedback...`}
                        value={feedbackMessage}
                        onChange={(e) => setFeedbackMessage(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && sendFeedback()}
                      />
                      <Button onClick={sendFeedback} disabled={!feedbackMessage.trim()} className="w-full">
                        <Send className="w-4 h-4 mr-2" />
                        Send {feedbackType} Feedback
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

            {sessionPhase === "speaking" && liveFeedbacks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Live Feedback</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {liveFeedbacks
                      .filter((feedback) => feedback.to_participant === room.current_speaker)
                      .slice(-5)
                      .map((feedback) => (
                        <div key={feedback.id} className="text-sm p-2 bg-gray-50 rounded">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-medium">{feedback.from_name}</span>
                            <Badge variant="outline" className="text-xs">
                              {feedback.type === "positive" ? "👍" : feedback.type === "constructive" ? "💡" : "❓"}
                            </Badge>
                          </div>
                          <p className="text-gray-700">{feedback.message}</p>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {showReport && personalReport && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Trophy className="w-4 h-4 mr-2" />
                    Your Performance Report
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-2xl font-bold text-blue-600">{personalReport.overall_score}</div>
                        <div className="text-xs text-gray-600">Overall</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">{personalReport.eye_contact_score}</div>
                        <div className="text-xs text-gray-600">Eye Contact</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-purple-600">{personalReport.confidence_score}</div>
                        <div className="text-xs text-gray-600">Confidence</div>
                      </div>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2 flex items-center">
                        <Zap className="w-4 h-4 mr-1" />
                        AI Analysis
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center">
                            <Eye className="w-3 h-3 mr-1" />
                            Eye Contact
                          </span>
                          <span className="font-medium">{personalReport.eye_contact_score}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center">
                            <Volume2 className="w-3 h-3 mr-1" />
                            Voice
                          </span>
                          <span className="font-medium">{personalReport.volume_score}%</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Peer Feedback</h4>
                      <div className="grid grid-cols-3 gap-2 text-center text-sm">
                        <div>
                          <div className="text-lg font-bold text-green-600">
                            {personalReport.positive_feedback_count}
                          </div>
                          <div className="text-xs text-gray-600">Positive</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-orange-600">
                            {personalReport.constructive_feedback_count}
                          </div>
                          <div className="text-xs text-gray-600">Constructive</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-blue-600">{personalReport.questions_received}</div>
                          <div className="text-xs text-gray-600">Questions</div>
                        </div>
                      </div>
                    </div>

                    {personalReport.feedback_summary.strengths.length > 0 && (
                      <div>
                        <h4 className="font-medium text-green-600 mb-2 flex items-center">
                          <Star className="w-4 h-4 mr-1" />
                          Strengths (From Peers)
                        </h4>
                        <ul className="text-sm space-y-1">
                          {personalReport.feedback_summary.strengths
                            .slice(0, 3)
                            .map((strength: string, index: number) => (
                              <li key={index} className="text-gray-700">
                                • {strength}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}

                    {personalReport.feedback_summary.improvement_areas.length > 0 && (
                      <div>
                        <h4 className="font-medium text-orange-600 mb-2 flex items-center">
                          <Target className="w-4 h-4 mr-1" />
                          Areas to Improve
                        </h4>
                        <ul className="text-sm space-y-1">
                          {personalReport.feedback_summary.improvement_areas
                            .slice(0, 3)
                            .map((area: string, index: number) => (
                              <li key={index} className="text-gray-700">
                                • {area}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}

                    {personalReport.insights.length > 0 && (
                      <div>
                        <h4 className="font-medium text-blue-600 mb-2">Key Insights</h4>
                        <ul className="text-sm space-y-1">
                          {personalReport.insights.slice(0, 2).map((insight: string, index: number) => (
                            <li key={index} className="text-gray-700">
                              • {insight}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <Button
                      onClick={() => {
                        const dataStr = JSON.stringify(personalReport, null, 2)
                        const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr)
                        const exportFileDefaultName = `speech-report-${new Date().toISOString().split("T")[0]}.json`
                        const linkElement = document.createElement("a")
                        linkElement.setAttribute("href", dataUri)
                        linkElement.setAttribute("download", exportFileDefaultName)
                        linkElement.click()
                      }}
                      variant="outline"
                      className="w-full"
                    >
                      Download Detailed Report
                    </Button>
                  </div>
                                </CardContent>
              </Card>
            )}

            
          </div>
        </div>
      </div>
    </div>
  )
}