import React from 'react';
import { LiveKitRoom, RoomAudioRenderer, VideoConference, useParticipants } from '@livekit/components-react';
import '@livekit/components-styles';

function RoomContents() {
  const participants = useParticipants();
  return <><div className="participants-count">{participants.length} participant{participants.length===1?'':'s'} connecté{participants.length===1?'':'s'}</div><VideoConference/><RoomAudioRenderer/></>;
}
export default function LiveRoom({ token, serverUrl, onDisconnected }) {
  return <LiveKitRoom token={token} serverUrl={serverUrl} connect video audio onDisconnected={onDisconnected}><RoomContents/></LiveKitRoom>;
}
