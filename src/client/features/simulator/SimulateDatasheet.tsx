import { Link } from '@tanstack/react-router'
import { ChevronDown, Crosshair, Shield, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { datasheetMatchup } from './simulatorUrl'

/** Opens the simulator with this datasheet on the side the reader picks, the other side left to choose. */
export function SimulateDatasheet({ catalogueId, entryId }: { catalogueId: string; entryId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Swords /> Simulate <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem
          render={<Link to="/simulator" search={{ s: datasheetMatchup(catalogueId, entryId, 'attacker'), from: 'datasheet' }} />}
        >
          <Crosshair /> As attacker
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link to="/simulator" search={{ s: datasheetMatchup(catalogueId, entryId, 'defender'), from: 'datasheet' }} />}
        >
          <Shield /> As defender
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
