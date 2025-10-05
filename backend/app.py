from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel
from report_db import insert_report,get_stats
import os   
from key_manager import APIKeyManager
import json
import uuid
from typing import Dict, List,Optional
from dotenv import load_dotenv
load_dotenv(override=True)
API_KEY = os.getenv("GOOGLE_API")

base_prompt = """
You are a speech specialist, based on the text input you will recieve, assess the speech based on grammar and other public speaking skill such that the user can
learn how to improve there speech.
Keep it short, only 2-3 lines.
Here is the speech:
{text}
"""

report_prompt = """
You are a comprehensive speech and presentation coach. Based on the following data from a speech session, provide a detailed analysis and recommendations:

Session Duration: {duration} seconds
Audio Transcripts: {transcripts}
Posture Analysis: Good posture maintained for {good_posture_seconds} out of {total_seconds} seconds ({posture_percentage}%)
Hand Gestures: Hand gestures detected for {hand_gestures_seconds} out of {total_seconds} seconds ({gestures_percentage}%)
Speaking Activity: Active speaking detected for {speaking_seconds} out of {total_seconds} seconds ({speaking_percentage}%)

Please provide:
1. Overall Performance Summary (2-3 sentences)
2. Strengths identified
3. Areas for improvement
4. Specific recommendations for better public speaking
5. Score out of 10 for overall presentation skills

Keep the analysis comprehensive but concise.
"""

prompt_template = ChatPromptTemplate.from_template(base_prompt)
report_template = ChatPromptTemplate.from_template(report_prompt)

key_manager = APIKeyManager()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"], 
)

class MediaPipeData(BaseModel):
    session_duration: float
    good_posture_seconds: float
    hand_gestures_seconds: float
    speaking_seconds: float

class TextChunk(BaseModel):
    text: str
    response: str
    timestamp: float

class SessionData(BaseModel):
    mediapipe_data: MediaPipeData
    text_chunks: list[TextChunk]


class RoomData(BaseModel):
    name: str
    topic_category: str
    time_per_speaker: int
    max_participants: int
    is_public: bool
    description: Optional[str] = ""
    host_name: str

class UserJoinData(BaseModel):
    user_id: str
    user_name: str

class ConnectionManager:
    def __init__(self):
        self.active_connections = []
        self.session_start_times = {}
        
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        
    async def disconnect(self, websocket: WebSocket):
        try:
            self.active_connections.remove(websocket)
             
        except ValueError:
            pass
            
    async def send_text(self, text: str, websocket: WebSocket):
        await websocket.send_text(text)
        
manager = ConnectionManager()

def get_llm():
    return ChatGoogleGenerativeAI(
        model="gemini-2.0-flash", 
        google_api_key=key_manager.get_next_key()
    )

"""
Note (for Yashika and Divyansh): in the .env file put the 3 Gemini Api keys as follows (follow the exact structure):

GEMINI_API_KEY_1 = 
GEMINI_API_KEY_2 = 
GEMINI_API_KEY_3 = 

"""

async def call_gemini(message):
    llm = get_llm()
    chain = prompt_template|llm|StrOutputParser()
    response = await chain.ainvoke({"text":message})
    return response

async def generate_final_report(session_data: SessionData):
    text_chunks = session_data.text_chunks
    mediapipe_data = session_data.mediapipe_data
    
    transcripts = [chunk.text for chunk in text_chunks]
    
    # Calculate percentages
    total_seconds = mediapipe_data.session_duration
    posture_percentage = round((mediapipe_data.good_posture_seconds / total_seconds) * 100, 1)
    gestures_percentage = round((mediapipe_data.hand_gestures_seconds / total_seconds) * 100, 1)
    speaking_percentage = round((mediapipe_data.speaking_seconds / total_seconds) * 100, 1)
    
    llm = get_llm()
    chain = report_template|llm|StrOutputParser()
    
    report = await chain.ainvoke({
        "duration": total_seconds,
        "transcripts": " ".join(transcripts),
        "good_posture_seconds": mediapipe_data.good_posture_seconds,
        "total_seconds": total_seconds,
        "posture_percentage": posture_percentage,
        "hand_gestures_seconds": mediapipe_data.hand_gestures_seconds,
        "gestures_percentage": gestures_percentage,
        "speaking_seconds": mediapipe_data.speaking_seconds,
        "speaking_percentage": speaking_percentage
    })
    
    return report


@app.post("/submit-session-data")
async def submit_session_data(request: Request):
    try:
        data = await request.json()
        session_data = SessionData(**data)
        
        report = await generate_final_report(session_data)
        posture_score = round((session_data.mediapipe_data.good_posture_seconds / session_data.mediapipe_data.session_duration) * 100, 1)
        gesture_score = round((session_data.mediapipe_data.hand_gestures_seconds / session_data.mediapipe_data.session_duration) * 100, 1)
        speaking_score = round((session_data.mediapipe_data.speaking_seconds / session_data.mediapipe_data.session_duration) * 100, 1)
        total_score = round((posture_score+gesture_score+speaking_score)/3, 1)
        await insert_report(report,posture_score,gesture_score,speaking_score,total_score)
        return JSONResponse({
            "status": "success",
            "report": report,
            "session_summary": {
                "duration": session_data.mediapipe_data.session_duration,
                "posture_score": posture_score,
                "gesture_score": gesture_score,
                "speaking_score": speaking_score,
                "total_score":total_score,
                "total_speech_chunks": len(session_data.text_chunks)
            }
        })
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@app.get("/get-reports")
async def get_my_reports():
    return await get_stats()

@app.websocket("/ws/audio")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    try:
        while True:
            try:
                data = await websocket.receive_text()
                print(type(data))
                print(f"Received text: {data}")
                
                res = await call_gemini(data)
                    
                print(res)
                await manager.send_text(res, websocket)
                    
            except WebSocketDisconnect:
                await manager.disconnect(websocket)
                break
            except Exception as e: 
                print(f"Error: {str(e)}")
                break
    finally:
        await manager.disconnect(websocket)

# ADD: Enhanced room data structure and management
active_rooms: Dict[str, dict] = {}
room_connections: Dict[str, List[WebSocket]] = {}

async def broadcast_to_room(room_id: str, message: dict, exclude=None):
    """Broadcast message to all participants in a room"""
    if room_id not in room_connections:
        return
    
    dead_connections = []
    for ws in room_connections[room_id][:]:  # Create a copy to iterate safely
        if ws != exclude:
            try:
                # Check if WebSocket is still open before sending
                if ws.client_state.CONNECTED:
                    await ws.send_text(json.dumps(message))
            except Exception as e:
                print(f"Removing dead WebSocket connection: {e}")
                dead_connections.append(ws)
    
    # Remove dead connections
    for dead_ws in dead_connections:
        try:
            room_connections[room_id].remove(dead_ws)
        except ValueError:
            pass  # Connection already removed
    
    # Clean up empty room connections
    if not room_connections[room_id]:
        del room_connections[room_id]

# ADD: Room management endpoints
@app.post("/api/rooms")
async def create_room(room_data: RoomData):
    """Create a new room"""
    room_id = str(uuid.uuid4())[:8].upper()
    
    # Store room in active_rooms
    active_rooms[room_id] = {
        "id": room_id,
        "name": room_data.name,
        "host_name": room_data.host_name,
        "host_id": f"host_{room_id}",  # Generate host ID
        "topic_category": room_data.topic_category,
        "time_per_speaker": room_data.time_per_speaker,
        "max_participants": room_data.max_participants,
        "is_public": room_data.is_public,
        "description": room_data.description,
        "status": "waiting",  # waiting, active, completed
        "participants": [],
        "speaking_order": [],
        "current_speaker": None,
        "feedbacks": [],
        "created_at": "2025-01-01T00:00:00Z"  # Use actual timestamp if needed
    }
    
    return {"room_id": room_id}

@app.get("/api/rooms")
async def get_rooms():
    """Get all available rooms"""
    # Filter and return public rooms
    public_rooms = []
    for room_id, room in active_rooms.items():
        if room["is_public"] and room["status"] != "completed":
            public_rooms.append(room)
    
    return {"rooms": public_rooms}

@app.get("/api/rooms/{room_id}")
async def get_room(room_id: str):
    """Get details of a specific room"""
    if room_id in active_rooms:
        return {"room": active_rooms[room_id]}
    return JSONResponse({"error": "Room not found"}, status_code=404)

@app.post("/api/rooms/{room_id}/join")
async def join_room(room_id: str, user_data: UserJoinData):
    """Join a specific room"""
    if room_id not in active_rooms:
        return JSONResponse({"error": "Room not found"}, status_code=404)
    
    room = active_rooms[room_id]
    
    # Check if room is full
    if len(room["participants"]) >= room["max_participants"]:
        return JSONResponse({"error": "Room is full"}, status_code=400)
    
    return {"status": "joined", "room": room}

active_connections: Dict[str, Dict[str, WebSocket]] = {}

@app.websocket("/ws/room/{room_id}")
async def websocket_room_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()
    print(f"WebSocket connection accepted for room: {room_id}")

    # Initialize room connections
    if room_id not in room_connections:
        room_connections[room_id] = []
    if room_id not in active_connections:
        active_connections[room_id] = {}

    # --- Wait for first message to get user_id from client ---
    try:
        first_data = await websocket.receive_text()
        first_message = json.loads(first_data)
        if first_message.get("type") == "set_participant_name" and "user_id" in first_message:
            user_id = first_message["user_id"]
            user_name = first_message.get("user_name", f"User_{user_id[:6]}")
        else:
            user_id = str(uuid.uuid4())
            user_name = f"User_{user_id[:6]}"
    except Exception as e:
        print("Failed to get user_id from client, generating random:", e)
        user_id = str(uuid.uuid4())
        user_name = f"User_{user_id[:6]}"

    websocket.user_id = user_id

    client_host = websocket.client.host if websocket.client else "unknown"
    connection_key = f"{client_host}_{user_id[:8]}"

    if len(active_connections[room_id]) >= 10:
        await websocket.close(code=1008, reason="Too many connections")
        return

    # Store this connection
    active_connections[room_id][connection_key] = websocket
    room_connections[room_id].append(websocket)

    participant_added = False

    try:
        # ADD PARTICIPANT ONLY ONCE
        if room_id in active_rooms:
            room = active_rooms[room_id]
            if len(room["participants"]) < room["max_participants"]:
                existing_participant = next((p for p in room["participants"] if p.get("user_id") == user_id), None)
                if not existing_participant:
                    participant = {
                        "id": user_id,
                        "user_id": user_id,
                        "user_name": user_name,
                        "name": user_name,
                        "joined_at": "2025-01-01T00:00:00Z",
                        "camera_enabled": True,
                        "mic_enabled": True,
                        "is_host": len(room["participants"]) == 0,
                        "has_spoken": False
                    }
                    room["participants"].append(participant)
                    participant_added = True
                    print(f"✅ Added participant {user_id} to room {room_id}. Total: {len(room['participants'])}")
                    await broadcast_to_room(room_id, {
                        "type": "participant_joined",   
                        "room": room,  
                        "new_participant": participant
                    }, exclude=websocket)
                else:
                    print(f"🚫 Participant {user_id} already exists in room {room_id}")
            # Send initial room state to this connection only
            await websocket.send_text(json.dumps({
                "type": "room_state",
                "room": room,
                "user_id": user_id

            })) 
        # Message handling loop
        while True: 
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                print(f"📨 Message from {user_id}: {message.get('type', 'unknown')}")
                # Handle different message types
                if message["type"] == "set_participant_name":
                    if room_id in active_rooms:
                        room = active_rooms[room_id]
                        for participant in room["participants"]:
                            if participant["user_id"] == user_id:
                                participant["user_name"] = message["user_name"]
                                participant["name"] = message["user_name"]
                                break
                        
                        await broadcast_to_room(room_id, {
                            "type": "participant_updated",
                            "room": room
                        })
                
                elif message["type"] == "webrtc_offer":
                    print(f"🔗 WebRTC offer from {user_id} to {message.get('to', 'broadcast')}")
                    print(f"   Forwarding to room {room_id}")
                    await broadcast_to_room(room_id, {
                        "type": "webrtc_offer",
                        "from": user_id,  # ✅ This should be the actual UUID
                        "to": message.get("to"),
                        "offer": message["offer"]
                    }, exclude=websocket)
                    
                elif message["type"] == "webrtc_answer":
                    print(f"📞 WebRTC answer from {user_id} to {message.get('to', 'broadcast')}")
                    print(f"   Forwarding to room {room_id}")
                    await broadcast_to_room(room_id, {
            
                        "type": "webrtc_answer",
                        "from": user_id,  # ✅ This should be the actual UUID
                        "to": message.get("to"),
                        "answer": message["answer"]
                    }, exclude=websocket)
                 
                elif message["type"] == "webrtc_ice_candidate":
                    print(f"🧊 ICE candidate from {user_id} to {message.get('to', 'broadcast')}")
                    print(f"   Forwarding to room {room_id}")
                    await broadcast_to_room(room_id, {
                        "type": "webrtc_ice_candidate",
                        "from": user_id,  # ✅ This should be the actual UUID
                        "to": message.get("to"),
                        "candidate": message["candidate"]
                    }, exclude=websocket)
 
                elif message["type"] == "start_session":
                    print(f"🎬 Starting session for room {room_id}")
                    if room_id in active_rooms:
                        room = active_rooms[room_id]
                        room["status"] = "active"
                        
                        # Randomize speaking order
                        participants = room["participants"]
                        import random
                        random.shuffle(participants)
                        room["speaking_order"] = [p["user_id"] for p in participants]
                        room["current_speaker"] = room["speaking_order"][0] if participants else None
                        room["preparation_time"] = 60  # Add preparation time
                        
                        print(f"🎯 Speaking order: {room['speaking_order']}")
                        print(f"🎤 First speaker: {room['current_speaker']}")
                        
                    await broadcast_to_room(room_id, {
                        "type": "session_started",
                        "room": active_rooms[room_id]
                    })

                elif message["type"] == "preparation_complete":
                    print(f"✅ Preparation complete for room {room_id}")
                    if room_id in active_rooms:
                        room = active_rooms[room_id]
                        room["status"] = "speaking"
                        
                        print(f"🎤 Starting speaking phase for: {room['current_speaker']}")
                        
                        await broadcast_to_room(room_id, {
                            "type": "speaking_started",
                            "room": room,
                            "current_speaker": room["current_speaker"]
                        })

                elif message["type"] == "speaker_finished":
                    print(f"🏁 Speaker finished message received for room {room_id}")
                    print(f"📝 Current speaker being marked as finished: {message.get('participant_id')}")
                    
                    if room_id in active_rooms:
                        room = active_rooms[room_id]
                        current_speaker = message.get("participant_id") or room["current_speaker"]
                        
                        print(f"📝 Marking speaker {current_speaker} as finished")
                        
                        # Mark current speaker as finished
                        for participant in room["participants"]:
                            if participant["user_id"] == current_speaker:
                                participant["has_spoken"] = True
                                print(f"✅ Marked {current_speaker} as has_spoken=True")
                                break
                        
                        # Move to next speaker
                        speaking_order = room.get("speaking_order", [])
                        print(f"📋 Speaking order: {speaking_order}")
                        print(f"📍 Current speaker index: {speaking_order.index(current_speaker) if current_speaker in speaking_order else 'NOT FOUND'}")
                        
                        if current_speaker in speaking_order:
                            current_index = speaking_order.index(current_speaker)
                            
                            if current_index < len(speaking_order) - 1:
                                # Next speaker
                                next_speaker = speaking_order[current_index + 1]
                                room["current_speaker"] = next_speaker
                                
                                print(f"➡️ Moving to next speaker: {next_speaker}")
                                
                                await broadcast_to_room(room_id, {
                                    "type": "speaker_changed",
                                    "room": room,
                                    "next_speaker": room["current_speaker"]
                                })
                            else:
                                # All speakers done
                                print("🎉 All speakers completed - session ending")
                                room["status"] = "completed"
                                room["current_speaker"] = None
                                await broadcast_to_room(room_id, {
                                    "type": "session_completed",
                                    "room": room
                                })
                        else:
                            print(f"❌ ERROR: Current speaker {current_speaker} not found in speaking order!")
                    else:
                        print(f"❌ ERROR: Room {room_id} not found in active_rooms!")

                elif message["type"] == "next_speaker":
                    if room_id in active_rooms:
                        room = active_rooms[room_id]
                        speaking_order = room.get("speaking_order", [])
                        current_speaker = room.get("current_speaker")
                        
                        if current_speaker and current_speaker in speaking_order:
                            current_index = speaking_order.index(current_speaker)
                            if current_index < len(speaking_order) - 1:
                                room["current_speaker"] = speaking_order[current_index + 1]
                                await broadcast_to_room(room_id, {
                                    "type": "speaker_changed",
                                    "room": room
                                })
                            else:
                                room["status"] = "completed"
                                room["current_speaker"] = None
                                await broadcast_to_room(room_id, {
                                    "type": "session_completed",
                                    "room": room
                                })
                    
                elif message["type"] == "send_feedback":
                    print(f"📝 Feedback received: {message['feedback']}")
                    if room_id in active_rooms:
                        if "feedbacks" not in active_rooms[room_id]:
                            active_rooms[room_id]["feedbacks"] = []
                        
                        # Store feedback in room
                        active_rooms[room_id]["feedbacks"].append(message["feedback"])
                        print(f"📝 Total feedbacks in room: {len(active_rooms[room_id]['feedbacks'])}")
                    
                    # ✅ FIX: Broadcast feedback to all participants (not exclude sender)
                    await broadcast_to_room(room_id, {
                        "type": "send_feedback",
                        "feedback": message["feedback"]
                    })
                elif message["type"] == "toggle_camera":
                    if room_id in active_rooms:
                        room = active_rooms[room_id]
                        for participant in room["participants"]:
                            if participant["user_id"] == message["participant_id"]:
                                participant["camera_enabled"] = message["camera_enabled"]
                                break
                
                    await broadcast_to_room(room_id, {
                        "type": "participant_updated",
                        "room": active_rooms[room_id]
                    })
                    
                elif message["type"] == "toggle_mic":
                    if room_id in active_rooms:
                        room = active_rooms[room_id]
                        for participant in room["participants"]:
                            if participant["user_id"] == message["participant_id"]:
                                participant["mic_enabled"] = message["mic_enabled"]
                                break
                    
                    await broadcast_to_room(room_id, {
                        "type": "participant_updated",
                        "room": active_rooms[room_id]
                    })
                    
                else:
                    # Forward other messages
                    await broadcast_to_room(room_id, message, exclude=websocket)
            
            except json.JSONDecodeError as e:
                print(f"Invalid JSON from {user_id}: {e}")
                continue

            except Exception as e:
                print(f"Error processing message from {user_id}: {e}")
                break
                
    except WebSocketDisconnect:
        print(f"🔌 WebSocket disconnected for user {user_id} in room {room_id}")
        
    except Exception as e:
        print(f"❌ WebSocket error for user {user_id}: {e}")
        
    finally:
        # CLEANUP: Remove participant and connection
        try:
            if participant_added and room_id in active_rooms:
                room = active_rooms[room_id]
                original_count = len(room["participants"])
                room["participants"] = [p for p in room["participants"] if p.get("user_id") != user_id]
                new_count = len(room["participants"])
                
                if original_count != new_count:
                    print(f"🗑️ Removed participant {user_id}. Participants: {original_count} -> {new_count}")
                    
                    # Notify others about disconnection
                    try:
                        await broadcast_to_room(room_id, {
                            "type": "participant_disconnected",
                            "user_id": user_id,
                            "room": room
                        }) 
                    except:
                        pass
            
            # Remove from tracking
            if room_id in active_connections and connection_key in active_connections[room_id]:
                del active_connections[room_id][connection_key]
            
            # Remove WebSocket connection
            if websocket in room_connections.get(room_id, []):
                room_connections[room_id].remove(websocket)
                
            # Clean up empty rooms
            if room_id in active_connections and not active_connections[room_id]:
                del active_connections[room_id]
                
        except Exception as cleanup_error:
            print(f"⚠️ Cleanup error for {user_id}: {cleanup_error}")

@app.post("/submit-group-member-data")
async def submit_group_member_data(request: Request):
    try:
        data = await request.json()
        
        # Extract data
        participant_id = data["participant_id"]
        room_id = data["room_id"]
        mediapipe_data = data["mediapipe_data"]
        peer_feedbacks = data.get("peer_feedbacks", [])
        
        # Calculate MediaPipe scores
        session_duration = mediapipe_data["session_duration"]
        posture_score = round((mediapipe_data["good_posture_seconds"] / session_duration) * 100, 1)
        gesture_score = round((mediapipe_data["hand_gestures_seconds"] / session_duration) * 100, 1)
        speaking_score = round((mediapipe_data["speaking_seconds"] / session_duration) * 100, 1)
        
        # Calculate peer feedback score
        if peer_feedbacks:
            positive_count = sum(1 for f in peer_feedbacks if f.get("type") == "positive")
            total_feedbacks = len(peer_feedbacks)
            peer_score = (positive_count / total_feedbacks) * 100 if total_feedbacks > 0 else 50
        else:
            peer_score = 50
        
        # Weighted overall score (70% MediaPipe + 30% Peer Feedback)
        overall_score = round((posture_score + gesture_score + speaking_score) * 0.7 / 3 + peer_score * 0.3, 1)
        
        # Generate AI report
        feedback_text = " ".join([f.get("message", "") for f in peer_feedbacks])
        
        report_prompt = f"""
        Analyze this group presentation performance:
        
        Speaker Duration: {session_duration} seconds
        Posture Quality: {posture_score}% ({mediapipe_data["good_posture_seconds"]}s good posture)
        Hand Gestures: {gesture_score}% ({mediapipe_data["hand_gestures_seconds"]}s with gestures)
        Speaking Activity: {speaking_score}% ({mediapipe_data["speaking_seconds"]}s speaking)
        
        Peer Feedback ({len(peer_feedbacks)} comments):
        {feedback_text}
        
        Provide a comprehensive assessment including:
        1. Performance summary
        2. Strengths based on MediaPipe and peer feedback
        3. Areas for improvement
        4. Specific recommendations
        5. How peer feedback aligns with technical analysis
        """
        
        llm = get_llm()
        chain = ChatPromptTemplate.from_template("{prompt}") | llm | StrOutputParser()
        report = await chain.ainvoke({"prompt": report_prompt})
        
        return JSONResponse({
            "status": "success",
            "participant_id": participant_id,
            "report": report,
            "scores": {
                "posture_score": posture_score,
                "gesture_score": gesture_score,
                "speaking_score": speaking_score,
                "peer_feedback_score": round(peer_score, 1),
                "overall_score": overall_score
            },
            "feedback_summary": {
                "total_feedbacks": len(peer_feedbacks),
                "positive_count": sum(1 for f in peer_feedbacks if f.get("type") == "positive"),
                "constructive_count": sum(1 for f in peer_feedbacks if f.get("type") == "constructive")
            }
        })
        
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)
