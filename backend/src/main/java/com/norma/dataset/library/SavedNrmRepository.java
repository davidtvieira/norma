package com.norma.dataset.library;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface SavedNrmRepository extends JpaRepository<SavedNrm, UUID>, JpaSpecificationExecutor<SavedNrm> {

    /** Most recently saved or replaced first. */
    List<SavedNrm> findAllByOrderByUpdatedAtDesc();

    long countByCategoryId(UUID categoryId);

    /** How many normas are filed directly under each category that has any. */
    @Query("select n.categoryId as categoryId, count(n) as total from SavedNrm n where n.categoryId is not null group by n.categoryId")
    List<CategoryCount> countByCategory();

    /** Takes every norma filed under one of these categories out of it, so it is under none. Their dates are untouched. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SavedNrm n set n.categoryId = null where n.categoryId in :ids")
    int uncategorize(@Param("ids") Collection<UUID> ids);

    interface CategoryCount {
        UUID getCategoryId();

        long getTotal();
    }
}
