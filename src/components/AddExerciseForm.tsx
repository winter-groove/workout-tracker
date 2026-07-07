import { useState } from 'react';
import { BODY_PARTS, EQUIPMENTS, ICON_KEYS } from '../types';
import type { BodyPart, Equipment, Exercise, IconKey } from '../types';
import { addCustomExercise } from '../db/exercises';
import ExerciseIcon from './ExerciseIcon';

export default function AddExerciseForm({ onSaved }: { onSaved: (ex: Exercise) => void }) {
  const [name, setName] = useState('');
  const [bodyPart, setBodyPart] = useState<BodyPart>('가슴');
  const [equipment, setEquipment] = useState<Equipment>('바벨');
  const [iconKey, setIconKey] = useState<IconKey>('barbell');

  async function submit() {
    if (!name.trim()) return;
    const ex = await addCustomExercise({ name, bodyPart, equipment, iconKey });
    onSaved(ex);
  }

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="ex-name">운동 이름</label>
        <input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 스미스머신 벤치" />
      </div>
      <div className="field">
        <label htmlFor="ex-body">부위</label>
        <select id="ex-body" value={bodyPart} onChange={(e) => setBodyPart(e.target.value as BodyPart)}>
          {BODY_PARTS.map((b) => <option key={b}>{b}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ex-equip">기구</label>
        <select id="ex-equip" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
          {EQUIPMENTS.map((eq) => <option key={eq}>{eq}</option>)}
        </select>
      </div>
      <div className="field">
        <label>아이콘</label>
        <div className="icon-picks">
          {ICON_KEYS.map((k) => (
            <button key={k} type="button" className={`icon-pick ${k === iconKey ? 'on' : ''}`} onClick={() => setIconKey(k)} aria-label={k}>
              <ExerciseIcon iconKey={k} size={24} />
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn-primary" onClick={submit}>등록</button>
    </div>
  );
}
