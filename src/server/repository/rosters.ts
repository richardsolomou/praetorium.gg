import type { SpacetimeOperator } from '../spacetimeOperator'
import { type RepositoryBase } from './area'

type RosterSummary = Awaited<ReturnType<SpacetimeOperator['rosterSummariesByUser']>>[number]

/** Saved rosters, their loadouts, loans and the favourites a player builds from. */
export function withRosters<B extends RepositoryBase>(Base: B) {
  return class RosterRepository extends Base {
    syncRoster(...args: Parameters<SpacetimeOperator['syncRoster']>) {
      return this.product.syncRoster(...args)
    }

    saveRoster(...args: Parameters<SpacetimeOperator['saveRoster']>) {
      return this.product.saveRoster(...args)
    }

    rostersByUser(...args: Parameters<SpacetimeOperator['rostersByUser']>) {
      return this.product.rostersByUser(...args)
    }

    rostersByIds(...args: Parameters<SpacetimeOperator['rostersByIds']>) {
      return this.product.rostersByIds(...args)
    }

    homeRostersByUser(...args: Parameters<SpacetimeOperator['homeRostersByUser']>) {
      return this.product.homeRostersByUser(...args)
    }

    publicRostersByUser(...args: Parameters<SpacetimeOperator['publicRostersByUser']>) {
      return this.product.publicRostersByUser(...args)
    }

    discoverRosters(...args: Parameters<SpacetimeOperator['discoverRosters']>) {
      return this.product.discoverRosters(...args)
    }

    rosterSummariesByUser(...args: Parameters<SpacetimeOperator['rosterSummariesByUser']>): Promise<RosterSummary[]> {
      return this.product.rosterSummariesByUser(...args)
    }

    rosterGroupByUser(...args: Parameters<SpacetimeOperator['rosterGroupByUser']>) {
      return this.product.rosterGroupByUser(...args)
    }

    roster(...args: Parameters<SpacetimeOperator['roster']>) {
      return this.product.roster(...args)
    }

    setRosterVisibility(...args: Parameters<SpacetimeOperator['setRosterVisibility']>) {
      return this.product.setRosterVisibility(...args)
    }

    unitLoadoutsByUser(...args: Parameters<SpacetimeOperator['unitLoadoutsByUser']>) {
      return this.product.unitLoadoutsByUser(...args)
    }

    saveUnitLoadout(...args: Parameters<SpacetimeOperator['saveUnitLoadout']>) {
      return this.product.saveUnitLoadout(...args)
    }

    renameUnitLoadout(...args: Parameters<SpacetimeOperator['renameUnitLoadout']>) {
      return this.product.renameUnitLoadout(...args)
    }

    deleteUnitLoadout(...args: Parameters<SpacetimeOperator['deleteUnitLoadout']>) {
      return this.product.deleteUnitLoadout(...args)
    }

    setRosterLocked(...args: Parameters<SpacetimeOperator['setRosterLocked']>) {
      return this.product.setRosterLocked(...args)
    }

    setRosterArchived(...args: Parameters<SpacetimeOperator['setRosterArchived']>) {
      return this.product.setRosterArchived(...args)
    }

    splitRosterVariant(...args: Parameters<SpacetimeOperator['splitRosterVariant']>) {
      return this.product.splitRosterVariant(...args)
    }

    changeRosters(...args: Parameters<SpacetimeOperator['changeRosters']>) {
      return this.product.changeRosters(...args)
    }

    favouriteFactionsByUser(...args: Parameters<SpacetimeOperator['favouriteFactionsByUser']>) {
      return this.product.favouriteFactionsByUser(...args)
    }

    addFavouriteFaction(...args: Parameters<SpacetimeOperator['addFavouriteFaction']>) {
      return this.product.addFavouriteFaction(...args)
    }

    removeFavouriteFaction(...args: Parameters<SpacetimeOperator['removeFavouriteFaction']>) {
      return this.product.removeFavouriteFaction(...args)
    }

    favouriteDatasheetsByUser(...args: Parameters<SpacetimeOperator['favouriteDatasheetsByUser']>) {
      return this.product.favouriteDatasheetsByUser(...args)
    }

    addFavouriteDatasheet(...args: Parameters<SpacetimeOperator['addFavouriteDatasheet']>) {
      return this.product.addFavouriteDatasheet(...args)
    }

    removeFavouriteDatasheet(...args: Parameters<SpacetimeOperator['removeFavouriteDatasheet']>) {
      return this.product.removeFavouriteDatasheet(...args)
    }

    favouriteDetachmentsByUser(...args: Parameters<SpacetimeOperator['favouriteDetachmentsByUser']>) {
      return this.product.favouriteDetachmentsByUser(...args)
    }

    addFavouriteDetachment(...args: Parameters<SpacetimeOperator['addFavouriteDetachment']>) {
      return this.product.addFavouriteDetachment(...args)
    }

    removeFavouriteDetachment(...args: Parameters<SpacetimeOperator['removeFavouriteDetachment']>) {
      return this.product.removeFavouriteDetachment(...args)
    }

    deleteRoster(...args: Parameters<SpacetimeOperator['deleteRoster']>) {
      return this.product.deleteRoster(...args)
    }

    lendRoster(...args: Parameters<SpacetimeOperator['lendRoster']>) {
      return this.product.lendRoster(...args)
    }

    endRosterLoan(...args: Parameters<SpacetimeOperator['endRosterLoan']>) {
      return this.product.endRosterLoan(...args)
    }

    rosterLoansByRoster(...args: Parameters<SpacetimeOperator['rosterLoansByRoster']>) {
      return this.product.rosterLoansByRoster(...args)
    }

    usableRoster(...args: Parameters<SpacetimeOperator['usableRoster']>) {
      return this.product.usableRoster(...args)
    }

    rostersLentTo(...args: Parameters<SpacetimeOperator['rostersLentTo']>) {
      return this.product.rostersLentTo(...args)
    }

    pushRosters(...args: Parameters<SpacetimeOperator['pushRosters']>) {
      return this.product.pushRosters(...args)
    }

    replaceRosterPointsMarks(...args: Parameters<SpacetimeOperator['replaceRosterPointsMarks']>) {
      return this.product.replaceRosterPointsMarks(...args)
    }
  }
}
