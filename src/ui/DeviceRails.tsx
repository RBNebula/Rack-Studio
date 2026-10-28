import type { Device, Project } from '../model';
import { deviceRailBoxes, deviceSupportRailBoxes, mmToScene } from '../engineering/geometry';
/** Open channel artwork within conservative collision envelopes. */
export function DeviceRails({ project, device }: { project: Project; device: Device }) {
  return (
    <group>
      {deviceRailBoxes(project, device).map((b) => {
        const size = b.max.map((v, i) => v - b.min[i]) as [number, number, number],
          center = b.min.map((v, i) => (v + b.max[i]) / 2) as [number, number, number];
        const t = Math.min(1, size[0] / 3);
        const pieces = b.id.endsWith('bracket')
          ? [{ p: [0, 0, 0], s: size }]
          : [
              { p: [0, 0, 0], s: [t, size[1], size[2]] },
              { p: [0, (size[1] - t) / 2, 0], s: [size[0], t, size[2]] },
              { p: [0, -(size[1] - t) / 2, 0], s: [size[0], t, size[2]] },
            ];
        return (
          <group key={b.id} position={mmToScene(center)}>
            {pieces.map((piece, i) => (
              <mesh key={i} position={mmToScene(piece.p as [number, number, number])}>
                <boxGeometry args={mmToScene(piece.s as [number, number, number])} />
                <meshStandardMaterial
                  color={b.id.endsWith('inner') ? '#d1d8dc' : '#9ba8b2'}
                  metalness={0.75}
                  roughness={0.35}
                />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* Fixed L-section support rails: the leg, flange and end tabs are exactly these solids. */}
      {deviceSupportRailBoxes(project, device).map((b) => (
        <mesh
          key={b.id}
          name={b.id}
          position={mmToScene(b.min.map((v, i) => (v + b.max[i]) / 2) as [number, number, number])}
        >
          <boxGeometry
            args={mmToScene(b.max.map((v, i) => v - b.min[i]) as [number, number, number])}
          />
          <meshStandardMaterial color="#8d989f" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}
