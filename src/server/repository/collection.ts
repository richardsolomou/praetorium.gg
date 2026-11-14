import type { SpacetimeOperator } from '../spacetimeOperator'
import { type RepositoryBase } from './area'

/** A player's model collection and its photos. */
export function withCollection<B extends RepositoryBase>(Base: B) {
  return class CollectionRepository extends Base {
    collectionProfile(...args: Parameters<SpacetimeOperator['collectionProfile']>) {
      return this.product.collectionProfile(...args)
    }

    collectionByUser(...args: Parameters<SpacetimeOperator['collectionByUser']>) {
      return this.product.collectionByUser(...args)
    }

    addToCollection(...args: Parameters<SpacetimeOperator['addToCollection']>) {
      return this.product.addToCollection(...args)
    }

    removeFromCollection(...args: Parameters<SpacetimeOperator['removeFromCollection']>) {
      return this.product.removeFromCollection(...args)
    }

    setCollectionModels(...args: Parameters<SpacetimeOperator['setCollectionModels']>) {
      return this.product.setCollectionModels(...args)
    }

    setCollectionProgress(...args: Parameters<SpacetimeOperator['setCollectionProgress']>) {
      return this.product.setCollectionProgress(...args)
    }

    setCollectionCountsAs(...args: Parameters<SpacetimeOperator['setCollectionCountsAs']>) {
      return this.product.setCollectionCountsAs(...args)
    }

    collectionWishesByUser(...args: Parameters<SpacetimeOperator['collectionWishesByUser']>) {
      return this.product.collectionWishesByUser(...args)
    }

    setCollectionWanted(...args: Parameters<SpacetimeOperator['setCollectionWanted']>) {
      return this.product.setCollectionWanted(...args)
    }

    importCollection(...args: Parameters<SpacetimeOperator['importCollection']>) {
      return this.product.importCollection(...args)
    }

    setCollectionPhoto(...args: Parameters<SpacetimeOperator['setCollectionPhoto']>) {
      return this.product.setCollectionPhoto(...args)
    }

    removeCollectionPhoto(...args: Parameters<SpacetimeOperator['removeCollectionPhoto']>) {
      return this.product.removeCollectionPhoto(...args)
    }

    collectionPhoto(...args: Parameters<SpacetimeOperator['collectionPhoto']>) {
      return this.product.collectionPhoto(...args)
    }

    datasheetPhotos(...args: Parameters<SpacetimeOperator['datasheetPhotos']>) {
      return this.product.datasheetPhotos(...args)
    }

    setCollectionPhotoLike(...args: Parameters<SpacetimeOperator['setCollectionPhotoLike']>) {
      return this.product.setCollectionPhotoLike(...args)
    }

    removeCollectionPhotoById(...args: Parameters<SpacetimeOperator['removeCollectionPhotoById']>) {
      return this.product.removeCollectionPhotoById(...args)
    }

    collectionPhotoForAdmin(...args: Parameters<SpacetimeOperator['collectionPhotoForAdmin']>) {
      return this.product.collectionPhotoForAdmin(...args)
    }

    reportCollectionPhoto(...args: Parameters<SpacetimeOperator['reportCollectionPhoto']>) {
      return this.product.reportCollectionPhoto(...args)
    }

    keepCollectionPhoto(...args: Parameters<SpacetimeOperator['keepCollectionPhoto']>) {
      return this.product.keepCollectionPhoto(...args)
    }

    heldCollectionPhotos(...args: Parameters<SpacetimeOperator['heldCollectionPhotos']>) {
      return this.product.heldCollectionPhotos(...args)
    }

    adminCollectionPhotos(...args: Parameters<SpacetimeOperator['adminCollectionPhotos']>) {
      return this.product.adminCollectionPhotos(...args)
    }

    collectionPhotoDeletions(...args: Parameters<SpacetimeOperator['collectionPhotoDeletions']>) {
      return this.product.collectionPhotoDeletions(...args)
    }

    collectionPhotoIds(...args: Parameters<SpacetimeOperator['collectionPhotoIds']>) {
      return this.product.collectionPhotoIds(...args)
    }

    clearCollectionPhotoDeletions(...args: Parameters<SpacetimeOperator['clearCollectionPhotoDeletions']>) {
      return this.product.clearCollectionPhotoDeletions(...args)
    }

    queueCollectionPhotoDeletion(...args: Parameters<SpacetimeOperator['queueCollectionPhotoDeletion']>) {
      return this.product.queueCollectionPhotoDeletion(...args)
    }
  }
}
