import type { DeviceDefinition } from '../model';
export function FaceFeatures({ definition: d }: { definition: DeviceDefinition }) {
  return (
    <>
      {(d.faceFeatures ?? []).map((f) => (
        <group
          key={f.id}
          position={[f.x, f.y, f.surface === 'front' ? -2.2 : d.depthMm + 0.2]}
          rotation={f.surface === 'front' ? [0, Math.PI, 0] : [0, 0, 0]}
        >
          <mesh>
            <planeGeometry args={[f.widthMm, f.heightMm]} />
            <meshStandardMaterial color="#111820" />
          </mesh>
          {f.kind === 'fan' ? (
            <mesh position={[0, 0, 0.1]}>
              <ringGeometry
                args={[
                  Math.min(f.widthMm, f.heightMm) * 0.3,
                  Math.min(f.widthMm, f.heightMm) * 0.46,
                  32,
                ]}
              />
              <meshStandardMaterial color="#747f89" />
            </mesh>
          ) : (
            Array.from({ length: Math.floor(f.widthMm / 5) }, (_, i) => (
              <mesh key={i} position={[-f.widthMm / 2 + 3 + i * 5, 0, 0.1]}>
                <planeGeometry args={[1, f.heightMm - 4]} />
                <meshStandardMaterial color="#697782" />
              </mesh>
            ))
          )}
        </group>
      ))}
    </>
  );
}
