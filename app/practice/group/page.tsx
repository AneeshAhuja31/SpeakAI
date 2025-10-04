"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Users, Plus, Search, Clock, Globe, Lock, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface RoomData {
  id: string
  name: string
  host: string
  participants: number
  maxParticipants: number
  topic: string
  isPublic: boolean
  timePerSpeaker: number
  status: string
}

export default function GroupPracticePage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<"join" | "create">("join")
  const [searchQuery, setSearchQuery] = useState("")
  const [roomCode, setRoomCode] = useState("")
  const [availableRooms, setAvailableRooms] = useState<RoomData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected")
  const [formData, setFormData] = useState({
    roomName: "",
    maxParticipants: 6,
    topicCategory: "Everyday Conversations",
    timePerSpeaker: 1,
    privacy: "public",
    description: "",
  })
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    const loadRooms = async () => {
      try {
        setIsLoading(true)
        setError(null) // Clear previous errors
        setConnectionStatus("connecting")

        // REPLACE: Load from FastAPI backend instead of localStorage
        const response = await fetch("http://localhost:8000/api/rooms")
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}: ${response.statusText}`)
        }
        const data = await response.json()
        setConnectionStatus("connected")

        if (data.rooms) {
          const transformedRooms = data.rooms
            .filter((room: any) => room.is_public && room.status !== "completed")
            .map((room: any) => ({
              id: room.id,
              name: room.name,
              host: room.host_name,
              participants: room.participants?.length || 0,
              maxParticipants: room.max_participants,
              topic: room.topic_category,
              isPublic: room.is_public,
              timePerSpeaker: room.time_per_speaker,
              status: room.status === "active" ? "active" : "waiting",
            }))
          
          setAvailableRooms(transformedRooms)
        }
      } catch (error) {
        console.error("Error loading rooms:", error)
        setConnectionStatus("disconnected")
        
        // Set user-friendly error messages
        if (error instanceof Error) {
          if (error.message.includes("fetch")) {
            setError("Cannot connect to server. Please make sure the backend is running on http://localhost:8000")
          } else {
            setError(`Failed to load rooms: ${error.message}`)
          }
        } else {
          setError("An unexpected error occurred while loading rooms")
        }
        
        setAvailableRooms([])
      } finally {
        setIsLoading(false)
      }
    }

    loadRooms()
  //   const interval = setInterval(loadRooms, 30000) // Refresh every 30 seconds
  //   return () => clearInterval(interval)
  // }, [])
  }, [])

  const filteredRooms = availableRooms.filter(
    (room) =>
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.host.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleJoinRoom = async (roomId: string) => {
    try {
      // Navigate to room
      router.push(`/rooms/${roomId}`)
    } catch (error) {
      console.error("Error joining room:", error)
      alert("Failed to join room. Please try again.")
    }
  }

  const handleJoinWithCode = () => {
    if (!roomCode.trim()) {
      alert("Please enter a room code")
      return
    }

    // Navigate to room with the provided code
    router.push(`/rooms/${roomCode.toUpperCase()}`)
  }

  const handleCreateRoom = async () => {
    if (!formData.roomName.trim()) {
      alert("Please enter a room name")
      return
    }

    setIsCreating(true)
    try {
      // REPLACE: Create room via API instead of localStorage
      const response = await fetch("http://localhost:8000/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.roomName,
          topic_category: formData.topicCategory,
          time_per_speaker: formData.timePerSpeaker,
          max_participants: formData.maxParticipants,
          is_public: formData.privacy === "public",
          description: formData.description,
          host_name: "Current User", // Replace with actual user name
        }),
      })

      const data = await response.json()
      
      if (data.room_id) {
        // Navigate to the created room
        router.push(`/rooms/${data.room_id}`)
      } else {
        throw new Error("Failed to create room")
      }
    } catch (error) {
      console.error("Error creating room:", error)
      alert("Failed to create room. Please try again.")
    } finally {
      setIsCreating(false)
    }
  }
  
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
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-4">Group Practice Sessions</h1>
            <p className="text-gray-600">Join existing rooms or create your own practice session with friends</p>
          </div>

          {/* Tab Navigation */}
          <div className="flex justify-center mb-8">
            <div className="bg-gray-100 p-1 rounded-lg">
              <Button
                variant={activeTab === "join" ? "default" : "ghost"}
                onClick={() => setActiveTab("join")}
                className="px-6"
              >
                <Search className="w-4 h-4 mr-2" />
                Join Room
              </Button>
              <Button
                variant={activeTab === "create" ? "default" : "ghost"}
                onClick={() => setActiveTab("create")}
                className="px-6"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Room
              </Button>
            </div>
          </div>

          {error && (
            <div className="mb-6">
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-red-500 rounded-full flex-shrink-0"></div>
                    <div>
                      <p className="text-red-800 font-medium">Connection Error</p>
                      <p className="text-red-600 text-sm">{error}</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2 text-red-600 border-red-300 hover:bg-red-100"
                        onClick={() => window.location.reload()}
                      >
                        Retry Connection
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {connectionStatus === "connecting" && !error && (
            <div className="mb-6">
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <p className="text-blue-800">Connecting to server...</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "join" && (
            <div className="space-y-6">
              {/* Search and Quick Join */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Search Rooms</CardTitle>
                    <CardDescription>Find public practice rooms to join</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search by name, topic, or host..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Join with Code</CardTitle>
                    <CardDescription>Enter a room code to join directly</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex space-x-2">
                      <Input
                        placeholder="Enter room code..."
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                        className="uppercase"
                        maxLength={6}
                      />
                      <Button onClick={handleJoinWithCode} disabled={!roomCode.trim()}>
                        Join
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Available Rooms */}
              <div>
                <h3 className="text-xl font-semibold mb-4">Available Rooms ({filteredRooms.length})</h3>
                {isLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading rooms...</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {filteredRooms.map((room) => (
                      <Card key={room.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <h4 className="text-lg font-semibold">{room.name}</h4>
                                <div className="flex items-center space-x-2">
                                  {room.isPublic ? (
                                    <Badge variant="secondary" className="text-xs">
                                      <Globe className="w-3 h-3 mr-1" />
                                      Public
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">
                                      <Lock className="w-3 h-3 mr-1" />
                                      Private
                                    </Badge>
                                  )}
                                  <Badge
                                    variant={room.status === "active" ? "default" : "secondary"}
                                    className="text-xs"
                                  >
                                    {room.status === "active" ? "In Progress" : "Waiting"}
                                  </Badge>
                                </div>
                              </div>

                              <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                                <div className="flex items-center space-x-2">
                                  <Users className="w-4 h-4" />
                                  <span>Host: {room.host}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Clock className="w-4 h-4" />
                                  <span>{room.timePerSpeaker} min per speaker</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-sm font-medium">Topic: </span>
                                  <span className="text-sm text-gray-600">{room.topic}</span>
                                </div>
                                <div className="text-sm text-gray-600">
                                  {room.participants}/{room.maxParticipants} participants
                                </div>
                              </div>
                            </div>

                            <div className="ml-6">
                              <Button
                                onClick={() => handleJoinRoom(room.id)}
                                disabled={room.participants >= room.maxParticipants}
                                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                              >
                                {room.participants >= room.maxParticipants ? "Full" : "Join Room"}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {!isLoading && filteredRooms.length === 0 && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h4 className="text-lg font-medium mb-2">No rooms found</h4>
                      <p className="text-gray-600 mb-4">
                        {searchQuery ? "Try adjusting your search terms" : "No public rooms are currently available"}
                      </p>
                      <Button onClick={() => setActiveTab("create")}>Create Your Own Room</Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {activeTab === "create" && (
            <div className="max-w-2xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle>Create New Practice Room</CardTitle>
                  <CardDescription>Set up a new group practice session</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Room Name</label>
                      <Input
                        placeholder="e.g., Morning Practice Group"
                        value={formData.roomName}
                        onChange={(e) => setFormData({ ...formData, roomName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Max Participants</label>
                      <Input
                        type="number"
                        placeholder="6"
                        min="2"
                        max="10"
                        value={formData.maxParticipants}
                        onChange={(e) =>
                          setFormData({ ...formData, maxParticipants: Number.parseInt(e.target.value) || 6 })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Speaking Topic Category</label>
                    <select
                      className="w-full p-2 border border-gray-300 rounded-md"
                      value={formData.topicCategory}
                      onChange={(e) => setFormData({ ...formData, topicCategory: e.target.value })}
                    >
                      <option>Everyday Conversations</option>
                      <option>Business & Professional</option>
                      <option>Current Events & Debate</option>
                      <option>Personal Stories</option>
                      <option>Educational Topics</option>
                      <option>Creative & Artistic</option>
                    </select>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Time per Speaker (minutes)</label>
                      <select
                        className="w-full p-2 border border-gray-300 rounded-md"
                        value={formData.timePerSpeaker}
                        onChange={(e) => setFormData({ ...formData, timePerSpeaker: Number.parseInt(e.target.value) })}
                      >
                        <option value="0.33">20 seconds</option>
                        <option value="2">2 minutes</option>
                        <option value="3">3 minutes</option>
                        <option value="4">4 minutes</option>
                        <option value="5">5 minutes</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Room Privacy</label>
                      <select
                        className="w-full p-2 border border-gray-300 rounded-md"
                        value={formData.privacy}
                        onChange={(e) => setFormData({ ...formData, privacy: e.target.value })}
                      >
                        <option value="public">Public (anyone can join)</option>
                        <option value="private">Private (invite only)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Room Description (Optional)</label>
                    <textarea
                      className="w-full p-2 border border-gray-300 rounded-md"
                      rows={3}
                      placeholder="Describe your practice session goals or any specific guidelines..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Room Features:</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Automatic topic generation for each speaker</li>
                      <li>• 1-minute preparation time before speaking</li>
                      <li>• Peer feedback collection after each speech</li>
                      <li>• Individual performance reports after session</li>
                    </ul>
                  </div>

                  <Button
                    onClick={handleCreateRoom}
                    disabled={isCreating}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    size="lg"
                  >
                    {isCreating ? "Creating Room..." : "Create Room"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
