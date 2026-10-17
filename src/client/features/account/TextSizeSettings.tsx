import { Choice, type ChoiceOption } from '../../components/Choice'
import { chooseTextSize, useTextSize, type TextSize } from '../../textSize'
import { SettingsSection } from './SettingsSection'

const SIZES: ChoiceOption<TextSize>[] = [
  { value: 'standard', name: 'Standard', detail: 'The compact layout' },
  { value: 'large', name: 'Large', detail: 'About 10% bigger' },
  { value: 'larger', name: 'Larger', detail: 'About 20% bigger' },
]

/** A reading preference kept on this device, applied as soon as it is chosen. */
export function TextSizeSettings() {
  const size = useTextSize()
  return (
    <SettingsSection title="Text size" description="Applies on this device only.">
      <Choice label="Text size" value={size} options={SIZES} onChange={chooseTextSize} />
    </SettingsSection>
  )
}
