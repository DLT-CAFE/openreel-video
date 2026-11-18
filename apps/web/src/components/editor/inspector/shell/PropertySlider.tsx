import React from "react";
import { ToolcraftSliderControl } from "@openreel/ui";
import { useInspectorV2 } from "../../inspector-v2/context"; // DLT Cafe M4
import { ParamRow } from "../../inspector-v2/kit/ParamRow"; // DLT Cafe M4

export interface PropertySliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  formatValue: (value: number) => string;
  isDisabled?: boolean;
  description?: string;
  className?: string;
}

export const PropertySlider: React.FC<PropertySliderProps> = (props) =>
  // DLT Cafe M4: Inspector V2 renders sliders as label | slider | number+stepper rows.
  useInspectorV2() ? (
    <div className={props.className}>
      <ParamRow
        label={props.label}
        value={props.value}
        onChange={props.onChange}
        min={props.min}
        max={props.max}
        step={props.step}
        formatValue={props.formatValue}
        disabled={props.isDisabled}
        description={props.description}
      />
    </div>
  ) : (
    <ClassicPropertySlider {...props} />
  );

const ClassicPropertySlider: React.FC<PropertySliderProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  formatValue,
  isDisabled = false,
  description,
  className,
}) => (
  <div className={className}>
    <ToolcraftSliderControl
      label={label}
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      step={step}
      disabled={isDisabled}
      formatValue={formatValue}
    />
    {description ? (
      <p className="mt-1 text-[11px] text-fg-muted">{description}</p>
    ) : null}
  </div>
);
