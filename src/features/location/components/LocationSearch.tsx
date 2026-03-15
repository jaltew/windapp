import { useId, useMemo, useState } from "react";
import type { LocationSuggestion, SearchStatus } from "../../../types/location";
import { formatLocationLabel } from "../lib/locationLabel";

interface LocationSearchProps {
  query: string;
  status: SearchStatus;
  suggestions: LocationSuggestion[];
  errorMessage: string | null;
  onQueryChange: (nextValue: string) => void;
  onSelectSuggestion: (suggestion: LocationSuggestion) => void;
  onSubmitRawQuery: (query: string) => boolean;
  onInputFocusChange?: (isFocused: boolean) => void;
}

export function LocationSearch({
  query,
  status,
  suggestions,
  errorMessage,
  onQueryChange,
  onSelectSuggestion,
  onSubmitRawQuery,
  onInputFocusChange
}: LocationSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const listboxId = useId();

  const showPanel = isOpen && query.trim().length > 0;
  const panelState = useMemo(() => {
    if (status === "loading") {
      return "loading";
    }

    if (status === "error") {
      return "error";
    }

    if (status === "success" && suggestions.length === 0) {
      return "empty";
    }

    if (suggestions.length > 0) {
      return "results";
    }

    return "idle";
  }, [status, suggestions.length]);

  const handleSelect = (suggestion: LocationSuggestion) => {
    onSelectSuggestion(suggestion);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (!showPanel) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((currentIndex) => {
        const nextIndex = currentIndex + 1;
        return nextIndex >= suggestions.length ? 0 : nextIndex;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((currentIndex) => {
        const nextIndex = currentIndex - 1;
        return nextIndex < 0 ? suggestions.length - 1 : nextIndex;
      });
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      handleSelect(suggestions[activeIndex]);
      return;
    }

    if (event.key === "Enter") {
      const wasHandled = onSubmitRawQuery(query.trim());

      if (wasHandled) {
        event.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
      }

      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const isLabelFloating = isInputFocused || query.trim().length > 0;
  const isActiveFieldState = isInputFocused || query.trim().length > 0;

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
          onInputFocusChange?.(false);
        }
      }}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[#9F9F9F]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m21 21-4.34-4.34" />
            <circle cx="11" cy="11" r="8" />
          </svg>
        </span>
        <input
          id="location-search"
          name="location-search"
          type="text"
          autoComplete="off"
          className={`h-14 w-full rounded-[2px] border bg-white pl-11 pr-4 py-0 text-base leading-[56px] shadow-sm transition placeholder:text-transparent ${
            isActiveFieldState
              ? "border-[#525252]"
              : "border-[#CDCDCD]"
          } focus:border-[#525252] focus-visible:outline-none`}
          style={{
            color: isActiveFieldState ? "#525252" : "#9F9F9F"
          }}
          placeholder=" "
          value={query}
          aria-controls={listboxId}
          aria-expanded={showPanel}
          aria-autocomplete="list"
          onFocus={() => {
            setIsOpen(true);
            setIsInputFocused(true);
            onInputFocusChange?.(true);
          }}
          onBlur={() => setIsInputFocused(false)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            setIsOpen(true);
            setActiveIndex(-1);
            onQueryChange(event.target.value);
          }}
        />
        <label
          htmlFor="location-search"
          className={`pointer-events-none absolute left-10 bg-white px-1 transition-all ${
            isLabelFloating ? "-top-2 text-xs" : "top-1/2 -translate-y-1/2 text-base"
          }`}
          style={{
            color: isActiveFieldState ? "#525252" : "#9F9F9F"
          }}
        >
          Location
        </label>
      </div>

      {showPanel ? (
        <div className="absolute bottom-[calc(100%+0.5rem)] z-20 w-full rounded-[2px] border border-[#CDCDCD] bg-[#F6F6F6] p-2 shadow-[0_1px_9px_4px_rgba(181,181,181,0.1804)] sm:bottom-auto sm:top-full sm:mt-2">
          {panelState === "loading" ? (
            <p className="rounded-[2px] px-3 py-2 text-sm text-[#7A7A7A]">Finding locations...</p>
          ) : null}

          {panelState === "error" ? (
            <p className="rounded-[2px] bg-[#ECECEC] px-3 py-2 text-sm text-[#525252]" role="alert">
              {errorMessage}
            </p>
          ) : null}

          {panelState === "empty" ? (
            <p className="rounded-[2px] px-3 py-2 text-sm text-[#7A7A7A]">No matching locations found.</p>
          ) : null}

          {panelState === "results" ? (
            <ul id={listboxId} role="listbox" className="space-y-1">
              {suggestions.map((suggestion, index) => {
                const isActive = activeIndex === index;

                return (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`w-full rounded-[2px] px-3 py-2 text-left text-sm transition ${
                        isActive ? "bg-[#ECECEC] text-[#333131]" : "text-[#525252] hover:bg-[#EFEFEF]"
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelect(suggestion)}
                    >
                      <span className="block font-medium">{formatLocationLabel(suggestion)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
