import { Choice, type ChoiceOption } from '../../components/Choice'
import { chooseTextSize, useTextSize, type TextSize } from '../../textSize'

const SIZES: ChoiceOption<TextSize>[] = [
  { value: 'standard', name: 'Standard', detail: 'The compact layout' },
  { value: 'large', name: 'Large', detail: 'About 10% bigger' },
  { value: 'larger', name: 'Larger', detail: 'About 20% bigger' },
]

/** A reading preference kept on this device, applied as soon as it is chosen. */
export function TextSizeSettings() {
  const size = useTextSize()
  return (
    <section className="space-y-4 border border-edge bg-panel p-5 md:p-7 lg:col-span-2">
      <div>
        <p className="rubric border-b border-edge pb-2">Display</p>
        <h2 className="mt-4 text-base">Text size on this device</h2>
        <p className="mt-1 text-sm text-dim">Everything scales together, so layouts keep their shape at every size.</p>
      </div>
      <Choice label="Text size" value={size} options={SIZES} onChange={chooseTextSize} />
    </section>
  )
}
