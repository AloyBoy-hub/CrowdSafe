"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Moon, Sun, Sunset } from "lucide-react";

export type Theme = "light" | "dark" | "dim";

interface ThemeSwitcherProps {
  defaultValue?: Theme;
  value?: Theme;
  onValueChange?: (theme: Theme) => void;
}

const themeOptions: { value: Theme; cOption: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    cOption: "1",
    icon: <Sun className="switcher__icon" />
  },
  {
    value: "dark",
    cOption: "2",
    icon: <Moon className="switcher__icon" />
  },
  {
    value: "dim",
    cOption: "3",
    icon: <Sunset className="switcher__icon" />
  }
];

export function ThemeSwitcher({
  defaultValue = "light",
  value,
  onValueChange
}: ThemeSwitcherProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeValue = value ?? internalValue;

  useEffect(() => {
    if (value !== undefined) setInternalValue(value);
  }, [value]);

  const activeOption = useMemo(
    () => themeOptions.find((opt) => opt.value === activeValue)?.cOption ?? "1",
    [activeValue]
  );

  const handleChange = (newValue: Theme) => {
    if (onValueChange) onValueChange(newValue);
    else setInternalValue(newValue);
  };

  return (
    <fieldset className="switcher" data-active={activeOption}>
      <legend className="switcher__legend">Choose theme</legend>
      <div className="switcher__thumb" />
      {themeOptions.map((option) => (
        <label key={option.value} className="switcher__option">
          <input
            className="switcher__input"
            type="radio"
            name="theme"
            value={option.value}
            data-option={option.cOption}
            checked={activeValue === option.value}
            onChange={() => handleChange(option.value)}
          />
          {option.icon}
        </label>
      ))}
    </fieldset>
  );
}

