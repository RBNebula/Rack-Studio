import { useState } from 'react';
import type { Rack, Vec3 } from '../model';
import { uid } from '../model';
import { Badge, Button, Field, Icon, NumberField } from './shared';

type Member = Rack['members'][number];
type Profile = Member['profile'];
const evidenceLabels = {
  unknown: 'Unknown',
  example: 'Provisional example',
  'user-entered': 'User-entered / unverified',
  verified: 'Verified measurement',
} as const;

interface NewMemberDraft {
  name: string;
  profile: Profile | '';
  profileAxis: Member['profileAxis'];
  profileRotationQuarterTurns: number;
  position: [string, string, string];
  size: [string, string, string];
  wallMm: string;
  evidence: Member['evidence'];
  source: string;
}
const blankDraft = (): NewMemberDraft => ({
  name: '',
  profile: '',
  profileAxis: 'y',
  profileRotationQuarterTurns: 0,
  position: ['', '', ''],
  size: ['', '', ''],
  wallMm: '',
  evidence: 'unknown',
  source: '',
});

function draftIssues(draft: NewMemberDraft): string[] {
  const issues: string[] = [];
  if (!draft.name.trim()) issues.push('Enter a member name.');
  if (!draft.profile) issues.push('Choose the member profile.');
  if (draft.position.some((v) => !v.trim() || !Number.isFinite(Number(v))))
    issues.push('Enter all three centre coordinates; zero is valid.');
  if (draft.size.some((v) => !v.trim() || !Number.isFinite(Number(v)) || Number(v) <= 0))
    issues.push('Enter three positive physical dimensions.');
  if (draft.profile && draft.profile !== 'box') {
    const wall = Number(draft.wallMm);
    const axis = ['x', 'y', 'z'].indexOf(draft.profileAxis);
    const crossSection = draft.size.filter((_, i) => i !== axis).map(Number);
    if (!draft.wallMm.trim() || !Number.isFinite(wall) || wall <= 0)
      issues.push('Enter the wall thickness to define an angle or channel profile.');
    else if (crossSection.some((v) => Number.isFinite(v) && wall * 2 >= v))
      issues.push('Wall thickness must be less than half both cross-section dimensions.');
  }
  if (draft.profile === 'box' && draft.wallMm.trim()) {
    const wall = Number(draft.wallMm);
    if (!Number.isFinite(wall) || wall <= 0)
      issues.push('Wall thickness must be positive, or empty when unknown.');
  }
  return issues;
}

export function StructuralMembers({
  members,
  onChange,
  onDraftPendingChange,
}: {
  members: Rack['members'];
  onChange: (members: Rack['members']) => void;
  onDraftPendingChange: (pending: boolean) => void;
}) {
  const [draft, setDraft] = useState<NewMemberDraft | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const update = (id: string, patch: Partial<Member>) =>
    onChange(members.map((member) => (member.id === id ? { ...member, ...patch } : member)));
  const updateDraft = (patch: Partial<NewMemberDraft>) => {
    if (draft) setDraft({ ...draft, ...patch });
  };
  const cancel = () => {
    setDraft(null);
    setShowIssues(false);
    onDraftPendingChange(false);
  };
  const add = () => {
    if (!draft) return;
    setShowIssues(true);
    if (draftIssues(draft).length || !draft.profile) return;
    onChange([
      ...members,
      {
        id: uid('member'),
        name: draft.name.trim(),
        profile: draft.profile,
        profileAxis: draft.profileAxis,
        profileRotationQuarterTurns: draft.profileRotationQuarterTurns,
        position: draft.position.map(Number) as Vec3,
        size: draft.size.map(Number) as Vec3,
        wallMm: draft.wallMm.trim() ? Number(draft.wallMm) : null,
        evidence: draft.evidence,
        source: draft.source,
      },
    ]);
    cancel();
  };
  return (
    <section aria-label="Structural members">
      <div className="section-title">
        <h3>Structural members</h3>
        <Badge>{members.length} defined</Badge>
      </div>
      <p className="small muted">
        Define beams and crossmembers from a reference. Positions are world centres in mm. Add
        separate members for a compound construction; depth steps do not create measured supports.
        Changes are saved together with Apply rack configuration.
      </p>
      {!members.length && <p className="small muted">No explicit structural members defined.</p>}
      {members.map((member) => (
        <details className="depth-section" key={member.id}>
          <summary>
            <strong>{member.name || 'Unnamed member'}</strong>{' '}
            <Badge tone={member.evidence === 'verified' ? 'good' : 'warn'}>
              {evidenceLabels[member.evidence]}
            </Badge>
          </summary>
          <div role="group" aria-label={`Structural member ${member.name}`}>
            <Field label="Member name">
              <input
                value={member.name}
                onChange={(e) => update(member.id, { name: e.target.value })}
              />
            </Field>
            <Field label="Member profile">
              <select
                value={member.profile}
                onChange={(e) => update(member.id, { profile: e.target.value as Profile })}
              >
                <option value="box">Solid box / rectangular member</option>
                <option value="angle">Angle</option>
                <option value="channel">Channel</option>
              </select>
            </Field>
            <MemberOrientation
              profile={member.profile}
              axis={member.profileAxis}
              turn={member.profileRotationQuarterTurns}
              onChange={(patch) => update(member.id, patch)}
            />
            {(['position', 'size'] as const).map((key) => (
              <div key={key}>
                <h4>{key === 'position' ? 'World centre (mm)' : 'Physical envelope (mm)'}</h4>
                <div className="form-grid three">
                  {member[key].map((value, axis) => (
                    <NumberField
                      key={axis}
                      label={`${key === 'position' ? 'Centre' : 'Size'} ${['X', 'Y', 'Z'][axis]} (mm)`}
                      value={value}
                      min={key === 'position' ? -100000 : 0.1}
                      step={0.1}
                      onChange={(next) =>
                        update(member.id, {
                          [key]: member[key].map((v, i) => (axis === i ? next : v)) as Vec3,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
            <WallThickness
              value={member.wallMm}
              onChange={(wallMm) => update(member.id, { wallMm })}
            />
            <MemberEvidence
              evidence={member.evidence}
              source={member.source}
              onChange={(patch) => update(member.id, patch)}
            />
            <Button
              icon="trash"
              className="subtle danger"
              onClick={() => onChange(members.filter((v) => v.id !== member.id))}
            >
              Remove member
            </Button>
          </div>
        </details>
      ))}
      {draft ? (
        <div className="depth-section" role="group" aria-label="New structural member">
          <h4>New structural member</h4>
          <Field label="New member name">
            <input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} />
          </Field>
          <Field label="New member profile">
            <select
              value={draft.profile}
              onChange={(e) =>
                updateDraft({ profile: e.target.value as NewMemberDraft['profile'] })
              }
            >
              <option value="">Choose a profile</option>
              <option value="box">Solid box / rectangular member</option>
              <option value="angle">Angle</option>
              <option value="channel">Channel</option>
            </select>
          </Field>
          {draft.profile && (
            <MemberOrientation
              profile={draft.profile}
              axis={draft.profileAxis}
              turn={draft.profileRotationQuarterTurns}
              onChange={updateDraft}
            />
          )}
          {(['position', 'size'] as const).map((key) => (
            <div key={key}>
              <h4>{key === 'position' ? 'World centre (mm)' : 'Physical envelope (mm)'}</h4>
              <div className="form-grid three">
                {draft[key].map((value, axis) => (
                  <Field
                    key={axis}
                    label={`New ${key === 'position' ? 'centre' : 'size'} ${['X', 'Y', 'Z'][axis]} (mm)`}
                  >
                    <input
                      type="number"
                      step="any"
                      min={key === 'size' ? 0.1 : undefined}
                      value={value}
                      onChange={(e) =>
                        updateDraft({
                          [key]: draft[key].map((v, i) => (axis === i ? e.target.value : v)),
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
          <Field
            label="New wall thickness (mm)"
            hint="Required for angle/channel profiles; no wall thickness is inferred. A box profile is solid."
          >
            <input
              type="number"
              min={0.1}
              step="any"
              value={draft.wallMm}
              onChange={(e) => updateDraft({ wallMm: e.target.value })}
            />
          </Field>
          <MemberEvidence evidence={draft.evidence} source={draft.source} onChange={updateDraft} />
          {showIssues && draftIssues(draft).length > 0 && (
            <div className="callout error" role="alert">
              <Icon name="alert" />
              <span>{draftIssues(draft).join(' ')}</span>
            </div>
          )}
          <Button icon="plus" onClick={add}>
            Add member to rack draft
          </Button>
          <Button className="subtle" onClick={cancel}>
            Cancel new member
          </Button>
        </div>
      ) : (
        <Button
          icon="plus"
          className="full-width"
          onClick={() => {
            setDraft(blankDraft());
            setShowIssues(false);
            onDraftPendingChange(true);
          }}
        >
          Add structural member
        </Button>
      )}
    </section>
  );
}

function MemberOrientation({
  profile,
  axis,
  turn,
  onChange,
}: {
  profile: Profile;
  axis: Member['profileAxis'];
  turn: number;
  onChange: (patch: Pick<Partial<Member>, 'profileAxis' | 'profileRotationQuarterTurns'>) => void;
}) {
  if (profile === 'box') return null;
  const crossAxes = ['X', 'Y', 'Z'].filter((v) => v.toLowerCase() !== axis);
  return (
    <>
      <div className="form-grid">
        <Field label="Profile extrusion axis">
          <select
            value={axis}
            onChange={(e) => onChange({ profileAxis: e.target.value as Member['profileAxis'] })}
          >
            {['x', 'y', 'z'].map((v) => (
              <option key={v} value={v}>
                {v.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Profile rotation">
          <select
            value={turn}
            onChange={(e) => onChange({ profileRotationQuarterTurns: Number(e.target.value) })}
          >
            {[0, 1, 2, 3].map((v) => (
              <option key={v} value={v}>
                {v * 90}°
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="small muted">
        At 0°, {profile === 'angle' ? 'walls meet at' : 'the channel opens toward'}{' '}
        {profile === 'angle' ? `−${crossAxes[0]} / −${crossAxes[1]}` : `+${crossAxes[1]}`}. Rotation
        turns the walls inside the world-aligned envelope; it does not swap its dimensions.
      </p>
    </>
  );
}

function MemberEvidence({
  evidence,
  source,
  onChange,
}: {
  evidence: Member['evidence'];
  source: string;
  onChange: (patch: Pick<Partial<Member>, 'evidence' | 'source'>) => void;
}) {
  return (
    <>
      <Field label="Member measurement status">
        <select
          value={evidence}
          onChange={(e) => onChange({ evidence: e.target.value as Member['evidence'] })}
        >
          {Object.entries(evidenceLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Member source / measurement note">
        <textarea value={source} onChange={(e) => onChange({ source: e.target.value })} />
      </Field>
    </>
  );
}

function WallThickness({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setDraft(value === null ? '' : String(value));
  }
  return (
    <Field
      label="Wall thickness (mm)"
      hint={value === null ? 'Unknown; angle/channel geometry requires a thickness.' : undefined}
    >
      <input
        type="number"
        min={0.1}
        step="any"
        placeholder="Unknown"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!draft.trim()) onChange(null);
          else if (Number.isFinite(Number(draft)) && Number(draft) > 0) onChange(Number(draft));
          else setDraft(value === null ? '' : String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </Field>
  );
}
