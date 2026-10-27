package com.norma.dataset.library;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.UUID;

public interface SavedNrmRepository extends JpaRepository<SavedNrm, UUID>, JpaSpecificationExecutor<SavedNrm> {

    /** Most recently saved or replaced first. */
    List<SavedNrm> findAllByOrderByUpdatedAtDesc();
}
