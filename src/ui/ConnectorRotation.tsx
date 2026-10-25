import type { Port } from '../model';
import { portRotationDeg } from '../engineering/ports';
import { Button, NumberField } from './shared';

export function ConnectorRotation({
  port,
  onChange,
}: {
  port: Port;
  onChange: (angle: number) => void;
}) {
  return (
    <>
      <NumberField
        label="Connector rotation (°)"
        value={port.rotationDeg ?? 0}
        min={-360}
        max={360}
        step={1}
        hint="Clockwise when looking at the connector face."
        onChange={onChange}
      />
      <Button onClick={() => onChange((portRotationDeg(port) + 90) % 360)}>
        Rotate connector 90°
      </Button>
    </>
  );
}
