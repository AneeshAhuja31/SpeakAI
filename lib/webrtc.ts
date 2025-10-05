export interface CallState {
  isConnected: boolean
  localStream?: MediaStream
  remoteStreams: Map<string, MediaStream>
  participants: string[]
}

class WebRTCService {
  private localStream: MediaStream | null = null
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private signalingSocket: WebSocket | null = null
  private currentUserId: string | null = null
  
  private callState: CallState = {
    isConnected: false,
    remoteStreams: new Map(),
    participants: [],
  }

  private iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      {
      urls: "turn:relay1.expressturn.com:3480",
      username: "000000002072354464", // <-- replace with your TURN username
      credential: "URGF0vnaKMoQ58xdOLZj2ZY2d3M=" // <-- replace with your TURN password
    }
    ],
  }

  setCurrentUserId(userId: string) {
    this.currentUserId = userId
    console.log("🆔 WebRTC service user ID set to:", userId)
  }

  setSignalingSocket(socket: WebSocket) {
    this.signalingSocket = socket
    console.log("📡 WebRTC signaling socket set")
  }

  private sendSignalingMessage(message: any) {
    if (!this.signalingSocket || this.signalingSocket.readyState !== WebSocket.OPEN) {
      console.warn("❌ WebSocket not available for signaling")
      return
    }

    if (!this.currentUserId) {
      console.warn("❌ No user ID set for signaling")
      return
    }

    const messageWithUserId = {
      ...message,
      from: this.currentUserId
    }

    console.log("📤 Sending WebRTC message:", messageWithUserId.type, "from:", messageWithUserId.from, "to:", messageWithUserId.to)
    this.signalingSocket.send(JSON.stringify(messageWithUserId))
  }

  async initializeLocalStream(): Promise<MediaStream> {
    try {
      if (this.localStream) {
        return this.localStream
      }

      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      this.callState.localStream = this.localStream
      
      // ✅ AUDIO DEBUG: Log stream details
      console.log("🎥 Local stream initialized with tracks:")
      console.log("📹 Video tracks:", this.localStream.getVideoTracks().map(t => ({ 
        id: t.id, 
        kind: t.kind, 
        enabled: t.enabled,
        label: t.label
      })))
      console.log("🔊 Audio tracks:", this.localStream.getAudioTracks().map(t => ({ 
        id: t.id, 
        kind: t.kind, 
        enabled: t.enabled,
        label: t.label
      })))
      
      return this.localStream
    } catch (error) {
      console.error("Error accessing media devices:", error)
      throw new Error("Could not access camera or microphone.")
    }
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const peerConnection = new RTCPeerConnection(this.iceServers)

    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        if (this.localStream) {
          console.log("➕ Adding track to peer connection:", track.kind, "enabled:", track.enabled)
          peerConnection.addTrack(track, this.localStream)
        }
      })
    }
    
    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log("🎥 ontrack fired for", peerId, "with", event.streams.length, "streams")
      console.log("🔊 Track details:", {
        kind: event.track.kind,
        enabled: event.track.enabled,
        id: event.track.id,
        label: event.track.label,
        muted: event.track.muted,
        readyState: event.track.readyState
      })
      
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0]
        console.log("📺 Stream tracks:", {
          video: stream.getVideoTracks().length,
          audio: stream.getAudioTracks().length,
          streamId: stream.id
        })
        
        this.callState.remoteStreams.set(peerId, stream)
        if (this.onRemoteStreamAdded) {
          this.onRemoteStreamAdded(peerId, stream)
        }
      }
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("🧊 Sending ICE candidate to:", peerId)
        this.sendSignalingMessage({
          type: "webrtc_ice_candidate",
          to: peerId,
          candidate: event.candidate
        })
      }
    }

    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔄 Peer ${peerId} connection state:`, peerConnection.connectionState)
      if (peerConnection.connectionState === "connected") {
        this.callState.isConnected = true
        if (!this.callState.participants.includes(peerId)) {
          this.callState.participants.push(peerId)
        }
      }
    }

    this.peerConnections.set(peerId, peerConnection)
    return peerConnection
  }

  private getOrCreatePeerConnection(peerId: string): RTCPeerConnection {
    let peerConnection = this.peerConnections.get(peerId)
    
    if (!peerConnection) {
      console.log("🔗 Creating new peer connection for:", peerId)
      peerConnection = this.createPeerConnection(peerId)
    }
    
    return peerConnection
  }

  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit | null> {
    try {
      console.log("📞 Creating offer for peer:", peerId)
      const pc = this.getOrCreatePeerConnection(peerId)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      this.sendSignalingMessage({
        type: "webrtc_offer",
        to: peerId,
        offer: offer
      })

      console.log("✅ Offer created and sent to:", peerId)
      return offer
    } catch (error) {
      console.error("❌ Error creating offer:", error)
      return null
    }
  }

  async createAnswer(peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    try {
      console.log("📞 Creating answer for peer:", peerId)
      const pc = this.getOrCreatePeerConnection(peerId)
      await pc.setRemoteDescription(offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      this.sendSignalingMessage({
        type: "webrtc_answer",
        to: peerId,
        answer: answer
      })

      console.log("✅ Answer created and sent to:", peerId)
      return answer
    } catch (error) {
      console.error("❌ Error creating answer:", error)
      return null
    }
  }

  async handleRemoteOffer(fromPeerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    try {
      console.log("📥 Handling remote offer from:", fromPeerId)
      await this.createAnswer(fromPeerId, offer)
    } catch (error) {
      console.error("❌ Error handling remote offer:", error)
    }
  }

  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    try {
      console.log("📥 Handling answer from:", peerId)
      const peerConnection = this.peerConnections.get(peerId)
      if (!peerConnection) {
        console.warn(`❌ No peer connection found for ${peerId}`)
        return
      }

      await peerConnection.setRemoteDescription(answer)
      console.log("✅ Answer processed for:", peerId)
    } catch (error) {
      console.error("❌ Error handling answer:", error)
    }
  }

  async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      const peerConnection = this.peerConnections.get(peerId)
      if (!peerConnection) {
        console.warn(`❌ No peer connection found for ${peerId}`)
        return
      }

      await peerConnection.addIceCandidate(candidate)
      console.log("✅ ICE candidate added for:", peerId)
    } catch (error) {
      console.error("❌ Error adding ICE candidate:", error)
    }
  }

  toggleAudio(enabled: boolean): void {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks()
      console.log(`🔊 Toggling audio to ${enabled ? 'ON' : 'OFF'} for ${audioTracks.length} tracks`)
      audioTracks.forEach((track) => {
        track.enabled = enabled
        console.log(`🔊 Audio track ${track.id} enabled:`, track.enabled)
      })
    } else {
      console.warn("❌ No local stream available for audio toggle")
    }
  }

  toggleVideo(enabled: boolean): void {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks()
      console.log(`📹 Toggling video to ${enabled ? 'ON' : 'OFF'} for ${videoTracks.length} tracks`)
      videoTracks.forEach((track) => {
        track.enabled = enabled
        console.log(`📹 Video track ${track.id} enabled:`, track.enabled)
      })
    } else {
      console.warn("❌ No local stream available for video toggle")
    }
  }

  endCall(): void {
    this.peerConnections.forEach((peerConnection) => {
      peerConnection.close()
    })
    this.peerConnections.clear()

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
      this.localStream = null
    }

    this.callState = {
      isConnected: false,
      remoteStreams: new Map(),
      participants: [],
    }
  }

  getCallState(): CallState {
    return { ...this.callState, localStream: this.localStream || undefined }
  }

  // Event handlers
  onRemoteStreamAdded?: (peerId: string, stream: MediaStream) => void
  onPeerDisconnected?: (peerId: string) => void
}

export const webrtcService = new WebRTCService()