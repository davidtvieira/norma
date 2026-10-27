package com.norma.dataset.library;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SavedNrmRepository extends JpaRepository<SavedNrm, UUID> {

    /** Most recently saved or replaced first. */
    List<SavedNrm> findAllByOrderByUpdatedAtDesc();
}
