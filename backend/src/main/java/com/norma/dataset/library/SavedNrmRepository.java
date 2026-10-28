package com.norma.dataset.library;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface SavedNrmRepository extends JpaRepository<SavedNrm, UUID>, JpaSpecificationExecutor<SavedNrm> {

    /** Most recently saved or replaced first. */
    List<SavedNrm> findAllByOrderByUpdatedAtDesc();

    boolean existsByCategoryId(UUID categoryId);

    long countByCategoryId(UUID categoryId);

    /** How many normas are filed directly under each category that has any. */
    @Query("select n.categoryId as categoryId, count(n) as total from SavedNrm n where n.categoryId is not null group by n.categoryId")
    List<CategoryCount> countByCategory();

    interface CategoryCount {
        UUID getCategoryId();

        long getTotal();
    }
}
