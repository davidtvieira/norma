package com.norma.dataset.dto;

/**
 * What the .nrm import endpoint returns: that the import went through and the {@code nrmId} every
 * later request about the .nrm uses (inputs, run, dataset). The .nrm already knows its dataset and
 * model, so neither id is handed out here.
 */
public record NrmImportStatus(String status, String nrmId) {

    public static NrmImportStatus success(String nrmId) {
        return new NrmImportStatus(DatasetImportStatus.SUCCESS, nrmId);
    }
}
