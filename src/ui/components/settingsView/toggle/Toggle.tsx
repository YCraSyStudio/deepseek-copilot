import "./Toggle.css";

type ToggleProps = {
  id: string;
  label?: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
};

function Toggle({ id, label, checked, onToggle, disabled = false }: ToggleProps) {
  return (
    <div className="toggleSwitch">
      {label && <label htmlFor={id}>{label}</label>}
      <input type="checkbox" id={id} checked={checked} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} />
    </div>
  );
}

export default Toggle;
