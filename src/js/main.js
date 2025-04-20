const backendUrl = "http://localhost:5000";

let institutionsDict = {};
let nonCCS = {};
let academicYears = {};
let majors = {};
let agreementGenerated = false;

export async function populateData(endpoint, targetObj) {
    try {
        const response = await fetch(`${backendUrl}/${endpoint}`);
        const data = await response.json();
        
        Object.assign(targetObj, data);
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        alert(`Failed to fetch ${endpoint}. Please try again.`);
    }
}

export function hideDropdown() {
    setTimeout(() => {
        const instDropdown = document.getElementById("institutionDropdown");
        if (instDropdown) instDropdown.innerHTML = "";
        const recDropdown = document.getElementById("receivingInstitutionDropdown");
        if (recDropdown) recDropdown.innerHTML = "";
        const yearsDropdown = document.getElementById("academicYearsDropdown");
        if (yearsDropdown) yearsDropdown.innerHTML = "";
    }, 150);
}

export function updateMajorsInputState() {
    const sendingInput = document.getElementById("searchInstitution");
    const receivingInput = document.getElementById("receivingInstitution");
    const academicYearInput = document.getElementById("academicYears");
    const majorsInput = document.getElementById("majors");

    if (
        sendingInput && sendingInput.getAttribute("data-sending-institution-id") &&
        receivingInput && receivingInput.getAttribute("data-receiving-institution-id") &&
        academicYearInput && academicYearInput.getAttribute("data-academic-year-id")
    ) {
        majorsInput && (majorsInput.disabled = false);
        populateData(
            `majors?sendingInstitutionId=${sendingInput.getAttribute("data-sending-institution-id")}&receivingInstitutionId=${receivingInput.getAttribute("data-receiving-institution-id")}&academicYearId=${academicYearInput.getAttribute("data-academic-year-id")}&categoryCode=major`, majors
        );
        majorsInput.setAttribute("data-major-key", majors[majorsInput.value]);
    } else {
        majorsInput && (majorsInput.disabled = true);
    }
}

export function filterDropdown(inputId, dropdownId, dataObj, dataAttr) {
    const searchInput = document.getElementById(inputId).value.toLowerCase();
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.innerHTML = "";

    Object.entries(dataObj).reverse().forEach(([name, id]) => {
        if (name.toLowerCase().includes(searchInput)) {
            const option = document.createElement("div");
            option.textContent = name;
            option.className = "dropdown-item";
            option.onmousedown = function () {
                if (agreementGenerated) {
                    resetAllFields();
                    return; // Optionally, prevent further actions until user re-selects
                }
                const input = document.getElementById(inputId);
                input.value = name;
                input.setAttribute(dataAttr, id.toString());
                dropdown.innerHTML = "";

                // If this is the sending institution, enable receiving institution
                if (inputId === "searchInstitution") {
                    const receivingInput = document.getElementById("receivingInstitution");
                    if (receivingInput) receivingInput.disabled = false;
                }

                // Reset majors input if any dependency changes
                if (
                    inputId === "searchInstitution" ||
                    inputId === "receivingInstitution" ||
                    inputId === "academicYears"
                ) {
                    const majorsInput = document.getElementById("majors");
                    if (majorsInput) {
                        majorsInput.value = "";
                        majorsInput.removeAttribute("data-major-key");
                    }
                }

                if (typeof updateMajorsInputState === "function") {
                    updateMajorsInputState();
                }

                if (typeof getArticulationAgreement === "function") {
                    // Only call if majors input is filled and has a data-major-key
                    const majorsInput = document.getElementById("majors");
                    if (
                        majorsInput &&
                        majorsInput.value &&
                        majorsInput.getAttribute("data-major-key")
                    ) {
                        getArticulationAgreement(inputId); // Pass the field that changed
                    }
                }
            };
            dropdown.appendChild(option);
        }
    });
}

export function filterInstitutions() {
    filterDropdown("searchInstitution", "institutionDropdown", institutionsDict, "data-sending-institution-id");
    const sendingInput = document.getElementById("searchInstitution");
    const receivingInput = document.getElementById("receivingInstitution");
    if (sendingInput && receivingInput) {
        if (sendingInput.getAttribute("data-sending-institution-id")) {
            receivingInput.disabled = false;
        } else {
            receivingInput.disabled = true;
        }
    }
    updateMajorsInputState();
}

export function filterNonCCs() {
    filterDropdown("receivingInstitution", "receivingInstitutionDropdown", nonCCS, "data-receiving-institution-id");
    updateMajorsInputState();
}

export function filterAcademicYears() {
    filterDropdown("academicYears", "academicYearsDropdown", academicYears, "data-academic-year-id");
    updateMajorsInputState();
}

export function filterMajors() {
    filterDropdown("majors", "majorsDropdown", majors, "data-major-id");
}

export async function getInstitutions() {
    try {
        const response = await fetch(`${backendUrl}/institutions`);
        const data = await response.json();
        displayResult(data);
    } catch (error) {
        displayResult({ error: error.message });
    }
}

export async function getAcademicYears() {
    try {
        const response = await fetch(`${backendUrl}/academic-years`);
        const data = await response.json();
        displayResult(data);
    } catch (error) {
        displayResult({ error: error.message });
    }
}

export async function getAllMajors() {
    const sendingInstitutionInput = document.getElementById("sendingInstitutionId");
    const receivingInstitutionInput = document.getElementById("receivingInstitutionId");
    const academicYearInput = document.getElementById("academicYearId");
    const categoryCodeInput = document.getElementById("categoryCode");

    if (!sendingInstitutionInput || !receivingInstitutionInput || !academicYearInput || !categoryCodeInput) {
        alert("Please fill in all fields.");
        return;
    }

    const sendingInstitutionId = sendingInstitutionInput.value;
    const receivingInstitutionId = receivingInstitutionInput.value;
    const academicYearId = academicYearInput.value;
    const categoryCode = categoryCodeInput.value;

    if (!sendingInstitutionId || !receivingInstitutionId || !academicYearId || !categoryCode) {
        alert("Please fill in all fields.");
        return;
    }

    try {
        const response = await fetch(`${backendUrl}/majors?sendingInstitutionId=${sendingInstitutionId}&receivingInstitutionId=${receivingInstitutionId}&academicYearId=${academicYearId}&categoryCode=${categoryCode}`);
        const data = await response.json();
        displayResult(data);
    } catch (error) {
        displayResult({ error: error.message });
    }
}

export async function getMajorKey() {
    const sendingInstitutionInput = document.getElementById("sendingInstitutionId");
    const receivingInstitutionInput = document.getElementById("receivingInstitutionId");
    const academicYearInput = document.getElementById("academicYearId");
    const categoryCodeInput = document.getElementById("categoryCode");
    const majorInput = document.getElementById("major");

    if (!sendingInstitutionInput || !receivingInstitutionInput || !academicYearInput || !categoryCodeInput || !majorInput) {
        alert("Please fill in all fields.");
        return;
    }

    const sendingInstitutionId = sendingInstitutionInput.value;
    const receivingInstitutionId = receivingInstitutionInput.value;
    const academicYearId = academicYearInput.value;
    const categoryCode = categoryCodeInput.value;
    const major = majorInput.value;

    if (!sendingInstitutionId || !receivingInstitutionId || !academicYearId || !categoryCode || !major) {
        alert("Please fill in all fields.");
        return;
    }

    try {
        const response = await fetch(`${backendUrl}/major-key?sendingInstitutionId=${sendingInstitutionId}&receivingInstitutionId=${receivingInstitutionId}&academicYearId=${academicYearId}&categoryCode=${categoryCode}&major=${major}`);
        const data = await response.json();
        displayResult(data);
    } catch (error) {
        displayResult({ error: error.message });
    }
}

export function allDependenciesSelected() {
    const sendingInput = document.getElementById("searchInstitution");
    const receivingInput = document.getElementById("receivingInstitution");
    const academicYearInput = document.getElementById("academicYears");
    return (
        sendingInput && sendingInput.getAttribute("data-sending-institution-id") &&
        receivingInput && receivingInput.getAttribute("data-receiving-institution-id") &&
        academicYearInput && academicYearInput.getAttribute("data-academic-year-id")
    );
}

export async function getArticulationAgreement(changedField) {
    const majorsInput = document.getElementById("majors");
    const key  = majorsInput.getAttribute("data-major-key");
    if (!key) {
        alert("No Agreement Found");
        return;
    }
    
    showLoadingAgreement();

    try {
        const response = await fetch(`${backendUrl}/articulation-agreement?key=${key}`);
        const data = await response.json();
        displayResult(data);
    } catch (error) {
        displayResult({ error: error.message });
    }

    // If a non-major field was changed and all dependencies are selected, re-populate majors
    if (changedField !== "majors" && allDependenciesSelected()) {
        const sendingInput = document.getElementById("searchInstitution");
        const receivingInput = document.getElementById("receivingInstitution");
        const academicYearInput = document.getElementById("academicYears");
        await populateData(
            `majors?sendingInstitutionId=${sendingInput.getAttribute("data-sending-institution-id")}&receivingInstitutionId=${receivingInput.getAttribute("data-receiving-institution-id")}&academicYearId=${academicYearInput.getAttribute("data-academic-year-id")}&categoryCode=major`,
            majors
        );
        // Update data-major-key after repopulating majors
        if (majorsInput) {
            const newMajorKey = majors[majorsInput.value];
            if (newMajorKey) {
                majorsInput.setAttribute("data-major-key", newMajorKey);
            } else {
                majorsInput.removeAttribute("data-major-key");
            }
        }
    }
}

export function showLoadingAgreement() {
    const resultContent = document.getElementById("resultContent");
    resultContent.textContent = "Loading Agreement...";
}

window.onload = function () {
    populateData('institutions', institutionsDict);
    populateData('nonccs', nonCCS);
    populateData('academic-years', academicYears);
};


export function displayResult(data) {
    const resultContent = document.getElementById("resultContent");
    if (data.pdf_filename) {
        window.open(`${backendUrl}/pdf/${data.pdf_filename}`, '_blank');
        resultContent.textContent = "PDF opened in a new tab.";
        agreementGenerated = true; // Set flag
        resetAllFields(); // Reset fields right after generating agreement
    } else {
        resultContent.textContent = JSON.stringify(data, null, 4);
    }
}

export function resetAllFields() {
    document.getElementById("searchInstitution").value = "";
    document.getElementById("searchInstitution").removeAttribute("data-sending-institution-id");
    document.getElementById("receivingInstitution").value = "";
    document.getElementById("receivingInstitution").removeAttribute("data-receiving-institution-id");
    document.getElementById("receivingInstitution").disabled = true;
    document.getElementById("academicYears").value = "";
    document.getElementById("academicYears").removeAttribute("data-academic-year-id");
    document.getElementById("majors").value = "";
    document.getElementById("majors").removeAttribute("data-major-key");
    agreementGenerated = false;
    updateMajorsInputState();
}
