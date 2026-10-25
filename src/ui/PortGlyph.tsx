import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Port } from '../model';
import { portSize } from '../engineering/ports';

/** Connector artwork uses the same centre and dimensions as the routable port.
 * Details are schematic; they do not assert a manufacturer socket specification. */
export function PortGlyph({
  port,
  hovered,
  dimmed,
}: {
  port: Port;
  hovered: boolean;
  dimmed: boolean;
}) {
  const [width, height] = portSize(port);
  const type = port.connector.toLowerCase();
  const round = type.includes('3.5') || type.includes('ps/2');
  const color = hovered
    ? '#36d7bd'
    : type.includes('usb')
      ? '#101317'
      : (port.visualColor ?? '#161b20');
  const border = hovered ? '#8ff6de' : '#a4a8a9';
  const polygon = useMemo(() => {
    const shape = new THREE.Shape();
    const w = width / 2;
    const h = height / 2;
    if (round) {
      shape.absarc(0, 0, Math.min(width, height) / 2, 0, Math.PI * 2, false);
    } else if (type.includes('rj45')) {
      shape.moveTo(-w, h);
      shape.lineTo(w, h);
      shape.lineTo(w, -h * 0.45);
      shape.lineTo(w * 0.58, -h * 0.45);
      shape.lineTo(w * 0.58, -h);
      shape.lineTo(-w * 0.58, -h);
      shape.lineTo(-w * 0.58, -h * 0.45);
      shape.lineTo(-w, -h * 0.45);
    } else if (type.includes('vga')) {
      shape.moveTo(-w, h);
      shape.lineTo(w, h);
      shape.lineTo(w * 0.82, -h);
      shape.lineTo(-w * 0.82, -h);
    } else if (type.includes('displayport')) {
      shape.moveTo(-w, -h);
      shape.lineTo(w, -h);
      shape.lineTo(w, h * 0.42);
      shape.lineTo(w * 0.65, h);
      shape.lineTo(-w, h);
    } else if (type.startsWith('iec')) {
      shape.moveTo(-w, -h);
      shape.lineTo(w, -h);
      shape.lineTo(w, h * 0.5);
      shape.lineTo(w * 0.65, h);
      shape.lineTo(-w * 0.65, h);
      shape.lineTo(-w, h * 0.5);
    } else {
      shape.moveTo(-w, -h);
      shape.lineTo(w, -h);
      shape.lineTo(w, h);
      shape.lineTo(-w, h);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [width, height, type, round]);
  useEffect(() => () => polygon.dispose(), [polygon]);
  const opacity = dimmed ? 0.3 : 1;
  return (
    <group scale={0.001}>
      <mesh geometry={polygon}>
        <meshBasicMaterial
          color={border}
          side={THREE.DoubleSide}
          transparent={dimmed}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, 0, 0.05]} scale={[0.83, 0.72, 1]}>
        <primitive object={polygon} attach="geometry" />
        <meshBasicMaterial
          color={color}
          side={THREE.DoubleSide}
          transparent={dimmed}
          opacity={opacity}
        />
      </mesh>
      {round && (
        <mesh position={[0, 0, 0.09]}>
          <circleGeometry args={[Math.min(width, height) * 0.22, 20]} />
          <meshBasicMaterial color="#080c10" transparent={dimmed} opacity={opacity} />
        </mesh>
      )}
      {type.includes('usb') && (
        <mesh position={[0, -height * 0.12, 0.1]}>
          <planeGeometry args={[width * 0.66, height * 0.22]} />
          <meshBasicMaterial
            color={
              port.visualColor && port.visualColor !== '#171b20' ? port.visualColor : '#bdc0b6'
            }
            transparent={dimmed}
            opacity={opacity}
          />
        </mesh>
      )}
      {(type.includes('displayport') || type.includes('hdmi')) && (
        <mesh position={[0, 0, 0.1]}>
          <planeGeometry args={[width * 0.63, height * 0.14]} />
          <meshBasicMaterial color="#aaa98a" transparent={dimmed} opacity={opacity} />
        </mesh>
      )}
      {type.includes('rj45') && (
        <group>
          {Array.from({ length: 8 }, (_, i) => (
            <mesh key={i} position={[(i - 3.5) * width * 0.075, -height * 0.25, 0.1]}>
              <planeGeometry args={[width * 0.035, height * 0.2]} />
              <meshBasicMaterial color="#c7ad6c" transparent={dimmed} opacity={opacity} />
            </mesh>
          ))}
        </group>
      )}
      {type === 'sfp' && (
        <group>
          <mesh position={[0, -height * 0.3, 0.1]}>
            <planeGeometry args={[width * 0.7, height * 0.08]} />
            <meshBasicMaterial color="#707b80" transparent={dimmed} opacity={opacity} />
          </mesh>
          <mesh position={[0, height * 0.27, 0.1]}>
            <planeGeometry args={[width * 0.34, height * 0.09]} />
            <meshBasicMaterial color="#494f56" transparent={dimmed} opacity={opacity} />
          </mesh>
        </group>
      )}
      {type.includes('vga') && (
        <group>
          {Array.from({ length: 15 }, (_, i) => (
            <mesh
              key={i}
              position={[
                ((i % 5) - 2) * width * 0.135,
                (Math.floor(i / 5) - 1) * height * 0.2,
                0.1,
              ]}
            >
              <circleGeometry args={[0.38, 8]} />
              <meshBasicMaterial color="#040608" transparent={dimmed} opacity={opacity} />
            </mesh>
          ))}
        </group>
      )}
      {type.startsWith('iec') && (
        <group>
          {[
            [-width * 0.22, -height * 0.08],
            [width * 0.22, -height * 0.08],
            [0, height * 0.23],
          ].map(([x, y], i) => (
            <mesh key={i} position={[x, y, 0.1]}>
              <planeGeometry args={[1.3, 3]} />
              <meshBasicMaterial color="#a8a9a6" transparent={dimmed} opacity={opacity} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}
