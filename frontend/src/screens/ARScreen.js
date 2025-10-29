import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import axios from 'axios';
import { Platform } from 'react-native';

export default function ARDisplayScreen() {
  const [elements, setElements] = useState([]);

  // Match Flask port (4200); use emulator loopback on Android
  const API_HOST = Platform.select({
    android: 'http://10.0.2.2:4200',
    ios: 'http://localhost:4200',
    default: 'http://localhost:4200',
  });

  useEffect(() => {
    // Fetch processed document elements
    axios.get(`${API_HOST}/api/upload/process`)
      .then(res => setElements(res.data.elements))
      .catch(err => console.error(err));
  }, []);

  return (
    <Canvas camera={{ position: [0, 0, 10] }}>
      <ambientLight intensity={0.5} />
      <OrbitControls />

      {elements.map((el) => (
        <mesh
          key={el.id}
          position={[el.position.x / 100, -el.position.y / 100, 0]}
          onClick={() => alert(el.label)}
        >
          <boxGeometry args={[el.size.width / 100, el.size.height / 100, 0.1]} />
          <meshStandardMaterial color={el.color} />
        </mesh>
      ))}
    </Canvas>
  );
}
