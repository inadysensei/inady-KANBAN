/**
 * Single source for the icon set (lucide-react). Re-exported under domain names
 * so the rest of the app references intent ("delete") not a vendor name, and so
 * swapping an icon is a one-line change here. Replaces the old emoji (☰, ⠿),
 * hand-drawn inline SVGs, and text labels.
 */
export {
  Trash2 as TrashIcon,
  Pencil as EditIcon,
  RotateCw as RerunIcon,
  Play as StartIcon,
  Square as StopIcon,
  Plus as AddIcon,
  Menu as MenuIcon,
  Bell as BellIcon,
  BellOff as BellOffIcon,
  X as CloseIcon,
  GripVertical as DragIcon,
  ChevronDown as CaretIcon,
  ChevronUp as MoveUpIcon,
  ChevronDown as MoveDownIcon,
  Check as CheckIcon,
  FolderOpen as FolderIcon,
  type LucideIcon,
} from "lucide-react";

/** Default icon pixel size for inline use next to text. */
export const ICON_SIZE = 16;
/** Compact icon size for dense controls (small icon-buttons, badges). */
export const ICON_SIZE_SM = 14;
