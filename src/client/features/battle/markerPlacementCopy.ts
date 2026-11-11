import type { MarkerPlacementKind } from '../../../core/missionSelections'

/** How each marker action reads at the table: the prompt, its one confirmation, and what the card counts. */
export const MARKER_PLACEMENT_COPY: Record<
  MarkerPlacementKind,
  { label: string; intro: string; ruledOut: string; confirm: string; counted: string; terrain?: true }
> = {
  decoy: {
    label: 'Record decoys',
    intro: 'Decoying is optional. Choose each objective a unit decoyed this turn.',
    ruledOut: 'Already decoyed',
    confirm: 'Each decoying unit controls its objective at the end of my turn, and none of these is my home objective',
    counted: 'decoyed objective',
  },
  triangulate: {
    label: 'Record triangulations',
    intro: 'Triangulating is optional. Choose each objective a unit triangulated this turn.',
    ruledOut: 'Your marker still stands at',
    confirm: 'Each triangulating unit controls its objective at the end of my turn, and none of these is my home objective',
    counted: 'triangulated objective',
  },
  'extract-intel': {
    label: 'Record intelligence',
    intro: 'Extracting intelligence is optional. Choose each objective where a unit placed a marker this turn.',
    ruledOut: 'Your marker still stands at',
    confirm: 'Each unit controls its objective at the end of my turn, and none of these is my home objective',
    counted: 'operation marker',
  },
  'maintain-control': {
    label: 'Record markers',
    intro: 'Maintaining control is optional. Choose each central objective where a unit placed a marker this turn.',
    ruledOut: '',
    confirm: 'Each of these is a central objective, and each unit controls it at the end of my turn',
    counted: 'operation marker',
  },
  'booby-trap': {
    label: 'Record traps',
    intro: 'Booby-trapping is optional. Name each terrain area a unit trapped this turn.',
    ruledOut: 'Already trapped',
    confirm: 'Each trapping unit was within range of an objective or within that terrain area, and none of these is in my deployment zone',
    counted: 'trapped terrain area',
    terrain: true,
  },
}
