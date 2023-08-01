//@ts-ignore
import {
  DisconnectReason,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  RoomOptions,
  Track,
  VideoPresets,
} from "livekit-client";

import { saveAs } from "file-saver";
import RecordRTC from "recordrtc";


const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

let currentRoom: Room | undefined;

let startTime: number;

const storedUrl = "wss://sadiq.livekit.cloud" ?? "ws://localhost:7880";
const storedToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2aWRlbyI6eyJyb29tIjoicFIyb1hSRnVncFRpd1N4dHBnQkFkWVRJNWtuMSIsInJvb21Kb2luIjp0cnVlLCJjYW5TdWJzY3JpYmUiOnRydWUsImNhblB1Ymxpc2giOmZhbHNlLCJjYW5QdWJsaXNoRGF0YSI6ZmFsc2V9LCJpYXQiOjE2OTA4ODc2ODAsIm5iZiI6MTY5MDg4NzY4MCwiZXhwIjoxNjkwOTA5MjgwLCJpc3MiOiJBUEljRmdEcEx1QTI5VGciLCJzdWIiOiJEUVV0dHk4bE9MZHN2emRESHlVZGZsOU10R2oxIiwianRpIjoiRFFVdHR5OGxPTGRzdnpkREh5VWRmbDlNdEdqMSJ9.Plq7uIGDv4Wovs5z_2eakN8B-q4Cqzx6nIjT1xyAWps";

// handles actions from the HTML
const appActions = {
  connectWithFormInput: async () => {
    const url = storedUrl;
    const token = storedToken;

    const roomOpts: RoomOptions = {
      publishDefaults: {
        videoSimulcastLayers: [VideoPresets.h90, VideoPresets.h216],
        dtx: true,
        red: true,
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    };

    await appActions.connectToRoom(url, token, roomOpts);
  },

  connectToRoom: async (
    url: string,
    token: string,
    roomOptions?: RoomOptions
  ): Promise<Room | undefined> => {
    const room = new Room(roomOptions);

    startTime = Date.now();
    await room.prepareConnection(url);

    room
      .on(RoomEvent.ParticipantConnected, participantConnected)
      .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
      .on(RoomEvent.DataReceived, handleData)
      .on(RoomEvent.Disconnected, handleRoomDisconnect)
      .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        console.log("track subscribed");
        renderParticipant(participant);
      })
      .on(RoomEvent.TrackUnsubscribed, (_, pub, participant) => {
        console.log("track unsubsribed");
        renderParticipant(participant);
      });

    try {
      await room.connect(url, token);
      console.log("Connected to Room");
    } catch (error: any) {
      let message: any = error;
      if (error.message) {
        message = error.message;
      }
      return;
    }
    currentRoom = room;
    window.currentRoom = room;

    room.participants.forEach((participant) => {
      participantConnected(participant);
    });
    participantConnected(room.localParticipant);

    return room;
  },

  disconnectRoom: () => {
    if (currentRoom) {
      currentRoom.disconnect();
    }
  },
};

declare global {
  interface Window {
    currentRoom: any;
    appActions: typeof appActions;
  }
}

window.appActions = appActions;

// --------------------------- event handlers ------------------------------- //

function handleData(msg: Uint8Array, participant?: RemoteParticipant) {
  console.log("Handle data");
  let from = "server";
  if (participant) {
    from = participant.identity;
  }
}

function participantConnected(participant: Participant) {
  console.log("tracks", participant.tracks);
}

function participantDisconnected(participant: RemoteParticipant) {
  console.log("Participant disconnected");
  renderParticipant(participant, true);
}

function handleRoomDisconnect(reason?: DisconnectReason) {
  console.log("Handle room disconnect");
  if (!currentRoom) return;
  renderParticipant(currentRoom.localParticipant, true);
  currentRoom.participants.forEach((p) => {
    renderParticipant(p, true);
  });

  const container = $("participants-area");
  if (container) {
    container.innerHTML = "";
  }

  currentRoom = undefined;
  window.currentRoom = undefined;
}

// -------------------------- rendering helpers ----------------------------- //

// updates participant UI
async function renderParticipant(
  participant: Participant,
  remove: boolean = false
) {
  console.log("Participant rendered", Participant);

  const divElement = document.createElement("div");
  divElement.id = "participants-area";
  document.body.appendChild(divElement);

  const container = divElement;

  if (!container) return;
  const { identity } = participant;
  let div = $(`participant-${identity}`);
  if (!div && !remove) {
    div = document.createElement("div");
    div.id = `participant-${identity}`;
    div.innerHTML = `
      <video id="video-${identity}"></video>
      <audio id="audio-${identity}"></audio>    

    `;
    container.appendChild(div);
  }
  const videoElm = <HTMLVideoElement>$(`video-${identity}`);
  const audioELm = <HTMLAudioElement>$(`audio-${identity}`);
  if (remove) {
    div?.remove();
    if (videoElm) {
      videoElm.srcObject = null;
      videoElm.src = "";
    }
    if (audioELm) {
      audioELm.srcObject = null;
      audioELm.src = "";
    }
    return;
  }

  const cameraPub = participant.getTrack(Track.Source.Camera);
  const micPub = participant.getTrack(Track.Source.Microphone);
  console.log("Before Recording stopped 1");

  const startRecording = () => {
    console.log("Before Recording stopped 2");

    const stream = new MediaStream();
    const videoTrack = cameraPub?.videoTrack?.mediaStreamTrack;
    const audioTrack = micPub?.audioTrack?.mediaStreamTrack;

    if (videoTrack) {
      stream.addTrack(videoTrack);
    }
    if (audioTrack) {
      stream.addTrack(audioTrack);
    }

    const recorder = new RecordRTC(stream, {
      type: "video",
      mimeType: "video/webm",
    });

    recorder.startRecording();

    console.log("Before Recording stopped");
    setTimeout(() => {
      recorder.stopRecording(() => {
        console.log("About to save the video, inside timeout");
        const blob = recorder.getBlob();
        saveAs(blob, "video.mp4");
      });
    }, 5000); // Change the duration to stop recording after a certain time
  }; 

  cameraPub?.videoTrack?.attach(videoElm);
  micPub?.audioTrack?.attach(audioELm);
  startRecording();
}

appActions.connectWithFormInput();
