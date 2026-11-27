/**
 * Primitives du design system (spec 055, docs/design-system/components/). Les imports par
 * fichier (`@/components/ui/Button`) restent valides ; ce point d'entrée les regroupe.
 */

export { default as Alert, type AlertTone } from "./Alert";
export { Badge, Badge as CountBadge, formatCount } from "./Badge";
export { default as BottomSheet } from "./BottomSheet";
export { default as BulkActionBar, selectionLabel } from "./BulkActionBar";
export { default as Button } from "./Button";
export {
  buttonClasses,
  iconButtonClasses,
  type IconButtonVariant,
  type Size as ButtonSize,
  type Variant as ButtonVariant,
} from "./button-classes";
export { default as Checkbox } from "./Checkbox";
export { default as CheckboxGroup } from "./CheckboxGroup";
export { default as ConfirmModal } from "./ConfirmModal";
export { default as DataTable, type DataTableSort } from "./DataTable";
export { default as EmptyState } from "./EmptyState";
export { default as FileInput, fileNamesSummary } from "./FileInput";
export { default as FilterChip, filterChipClasses } from "./FilterChip";
export { controlClasses, fieldLabelClasses, textareaClasses } from "./field-classes";
export { default as IconButton } from "./IconButton";
export { default as Input } from "./Input";
export { default as Menu, menuPosition, type MenuItem } from "./Menu";
export { default as Modal } from "./Modal";
export { default as PageHeader } from "./PageHeader";
export {
  default as RadioGroup,
  choiceChipClasses,
  radioInputClasses,
  type RadioOption,
} from "./RadioGroup";
export { rovingIndex, type RovingOrientation } from "./roving";
export { default as SearchInput } from "./SearchInput";
export { default as SegmentedControl, segmentClasses, type SegmentedOption } from "./SegmentedControl";
export { default as Select } from "./Select";
export { default as Skeleton, PageSkeleton, SkeletonList } from "./Skeleton";
export { default as StatusChip, statusToneClasses, type StatusTone } from "./StatusChip";
export {
  SERVICE_STATUS,
  SERVICE_STATUS_ORDER,
  isServiceStatus,
  serviceStatusDescriptor,
  type StatusDescriptor,
} from "./status";
export { default as Switch } from "./Switch";
export { default as Tabs, TabPanel, isTabActive, tabIds, type StateTabItem, type TabItem } from "./Tabs";
export { default as Textarea } from "./Textarea";
export { ToastProvider, useToast, type ToastApi } from "./Toast";
export type { ToastAction, ToastOptions, ToastTone } from "./toast-store";
