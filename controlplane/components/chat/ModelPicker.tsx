'use client';

import { Brain, Check, ChevronDown, Eye, FileText, Search, Type, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ChatModelOption } from '@/lib/ai/model-catalog';
import { cn } from '@/lib/utils';
import styles from './ModelPicker.module.css';

type Provider = ChatModelOption['provider'];
type DropdownSide = React.ComponentProps<typeof DropdownMenuContent>['side'];
type DropdownAlign = React.ComponentProps<typeof DropdownMenuContent>['align'];

type ModelPickerProps = {
  align?: DropdownAlign;
  className?: string;
  density?: 'default' | 'compact';
  disabled?: boolean;
  id?: string;
  label?: string;
  models: ChatModelOption[];
  onSelectModel: (modelId: string) => void;
  selectedModelId: string;
  showLabel?: boolean;
  side?: DropdownSide;
};

type ProviderMeta = {
  monochromeLogo?: boolean;
  logoSrc: string;
  name: string;
  shortName: string;
};

const PROVIDER_META: Record<Provider, ProviderMeta> = {
  anthropic: { monochromeLogo: true, logoSrc: '/provider-logos/anthropic.svg', name: 'Anthropic', shortName: 'ANT' },
  google: { logoSrc: '/provider-logos/google.svg', name: 'Google', shortName: 'GOO' },
  openai: { monochromeLogo: true, logoSrc: '/provider-logos/openai.svg', name: 'OpenAI', shortName: 'OAI' },
  openrouter: { logoSrc: '/provider-logos/openrouter.svg', name: 'OpenRouter', shortName: 'OR' },
};

const PROVIDER_ORDER: Provider[] = ['openai', 'anthropic', 'google', 'openrouter'];

type CapabilityMeta = {
  icon: LucideIcon;
  key: keyof ChatModelOption['capabilities'];
  label: string;
  shortLabel: string;
};

const CAPABILITY_META: CapabilityMeta[] = [
  { icon: Eye, key: 'hasVision', label: 'Vision', shortLabel: 'Vision' },
  { icon: Type, key: 'acceptsText', label: 'Text', shortLabel: 'Text' },
  { icon: FileText, key: 'acceptsFiles', label: 'Files', shortLabel: 'Files' },
  { icon: Wrench, key: 'canToolCall', label: 'Tools', shortLabel: 'Tools' },
  { icon: Brain, key: 'reasoning', label: 'Reasoning', shortLabel: 'Reason' },
];

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function compactModelName(model: ChatModelOption): string {
  const providerLabel = PROVIDER_META[model.provider].name;
  const withSpace = `${providerLabel} `;
  if (model.label.startsWith(withSpace)) {
    return model.label.slice(withSpace.length);
  }
  return model.label;
}

function modelIdSuffix(modelId: string): string {
  const separator = modelId.indexOf(':');
  if (separator === -1) {
    return modelId;
  }
  return modelId.slice(separator + 1);
}

export function ModelPicker({
  align = 'start',
  className,
  density = 'default',
  disabled = false,
  id,
  label = 'Model',
  models,
  onSelectModel,
  selectedModelId,
  showLabel = true,
  side = 'top',
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? models[0] ?? null,
    [models, selectedModelId],
  );

  const availableProviders = useMemo(() => {
    const present = new Set(models.map((model) => model.provider));
    return PROVIDER_ORDER.filter((provider) => present.has(provider));
  }, [models]);

  const selectedProviderId = selectedModel?.provider ?? availableProviders[0] ?? null;
  const [openProvider, setOpenProvider] = useState<Provider | null>(null);
  const activeProvider = open ? (openProvider ?? selectedProviderId) : selectedProviderId;

  const filteredModels = useMemo(() => {
    if (!activeProvider) {
      return [];
    }

    const providerModels = models.filter((model) => model.provider === activeProvider);
    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) {
      return providerModels;
    }

    return providerModels.filter((model) => {
      const providerName = PROVIDER_META[model.provider].name;
      const haystack = normalizeText(`${model.label} ${model.id} ${providerName}`);
      return haystack.includes(normalizedQuery);
    });
  }, [activeProvider, models, query]);

  const selectedProvider = selectedModel ? PROVIDER_META[selectedModel.provider] : null;
  const triggerTitle = selectedModel ? compactModelName(selectedModel) : 'No models available';

  function handleOpenChange(nextOpen: boolean): void {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setOpenProvider(null);
      return;
    }
    setOpenProvider(selectedProviderId);
  }

  function handleModelSelect(modelId: string): void {
    onSelectModel(modelId);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className={cn(styles.root, className)} data-density={density}>
      {showLabel ? <span className={styles.label}>{label}</span> : null}
      <DropdownMenu onOpenChange={handleOpenChange} open={open}>
        <DropdownMenuTrigger asChild>
          <button
            className={styles.triggerButton}
            disabled={disabled || models.length === 0}
            id={id}
            type="button"
          >
            {selectedProvider ? (
              <span className={styles.triggerProvider}>
                <Image
                  alt={`${selectedProvider.name} logo`}
                  className={cn(
                    styles.triggerProviderLogo,
                    selectedProvider.monochromeLogo ? styles.monochromeLogo : undefined,
                  )}
                  height={14}
                  src={selectedProvider.logoSrc}
                  width={14}
                />
                <span className={styles.triggerProviderText}>{selectedProvider.shortName}</span>
              </span>
            ) : null}
            <span className={styles.triggerText}>{triggerTitle}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn(styles.triggerChevron, open ? styles.triggerChevronOpen : undefined)}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className={styles.dropdownContent} side={side} sideOffset={8}>
          <div className={styles.panel}>
            <aside aria-label="Providers" className={styles.providerRail}>
              {availableProviders.map((provider) => {
                const meta = PROVIDER_META[provider];
                const isActive = provider === activeProvider;

                return (
                  <button
                    aria-pressed={isActive}
                    className={cn(styles.providerButton, isActive ? styles.providerButtonActive : undefined)}
                    key={provider}
                    onClick={() => setOpenProvider(provider)}
                    title={meta.name}
                    type="button"
                  >
                    <Image
                      alt={`${meta.name} logo`}
                      className={cn(styles.providerLogo, meta.monochromeLogo ? styles.monochromeLogo : undefined)}
                      height={18}
                      src={meta.logoSrc}
                      width={18}
                    />
                    <span className={styles.providerName}>{meta.shortName}</span>
                  </button>
                );
              })}
            </aside>
            <section className={styles.modelPane}>
              <div className={styles.searchBox}>
                <Search aria-hidden="true" className={styles.searchIcon} />
                <input
                  aria-label="Search models"
                  className={styles.searchInput}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search models..."
                  type="text"
                  value={query}
                />
              </div>
              <div className={styles.modelList}>
                {filteredModels.length > 0 ? (
                  filteredModels.map((model) => {
                    const isSelected = selectedModel?.id === model.id;
                    return (
                      <button
                        className={cn(styles.modelOption, isSelected ? styles.modelOptionActive : undefined)}
                        key={model.id}
                        onClick={() => handleModelSelect(model.id)}
                        type="button"
                      >
                        <span className={styles.modelText}>
                          <span className={styles.modelName}>{compactModelName(model)}</span>
                          <span className={styles.modelMeta}>
                            {PROVIDER_META[model.provider].name} · {modelIdSuffix(model.id)}
                          </span>
                          <span className={styles.modelCapabilityRow}>
                            {CAPABILITY_META.map((capability) => {
                              const Icon = capability.icon;
                              const enabled = model.capabilities[capability.key];
                              return (
                                <span
                                  className={cn(
                                    styles.modelCapabilityBadge,
                                    enabled
                                      ? styles.modelCapabilityBadgeEnabled
                                      : styles.modelCapabilityBadgeDisabled,
                                  )}
                                  key={capability.key}
                                  title={`${capability.label}: ${enabled ? 'Yes' : 'No'}`}
                                >
                                  <Icon aria-hidden="true" className={styles.modelCapabilityIcon} />
                                  <span>{capability.shortLabel}</span>
                                </span>
                              );
                            })}
                          </span>
                        </span>
                        {isSelected ? <Check aria-hidden="true" className={styles.modelCheck} /> : null}
                      </button>
                    );
                  })
                ) : (
                  <p className={styles.emptyState}>No models match this search.</p>
                )}
              </div>
            </section>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
