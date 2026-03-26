/**
 * AV Site Survey Form - Client-Side Logic
 *
 * Handles multi-room survey data collection, form validation,
 * file upload previews, draft saving, and server submission.
 */

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  /** @type {Object[]} Previously saved room data objects. */
  let savedRooms = [];

  /** @type {number} 1-based counter for the room currently being filled in. */
  let currentRoomIndex = 1;

  /** @type {File[]} Accumulated file uploads across all rooms. */
  let uploadedFiles = [];

  // -----------------------------------------------------------------------
  // Lookup helpers
  // -----------------------------------------------------------------------

  /**
   * Map internal room-size keys to display labels.
   * @param {string} size
   * @returns {string}
   */
  function formatRoomSize(size) {
    var labels = {
      huddle: 'Huddle Room',
      small: 'Small Conference',
      medium: 'Medium Conference',
      large: 'Large Conference',
    };
    return labels[size] || size;
  }

  /**
   * Map internal platform keys to display labels.
   * @param {string} platform
   * @returns {string}
   */
  function formatPlatform(platform) {
    var labels = {
      mtr: 'Microsoft Teams Room',
      zoom: 'Zoom Room',
      byod: 'BYOD Conferencing',
      presentation: 'Presentation Only',
    };
    return labels[platform] || platform;
  }

  // -----------------------------------------------------------------------
  // Room-size card selector
  // -----------------------------------------------------------------------

  document.querySelectorAll('.room-size-card').forEach(function (card) {
    card.addEventListener('click', function () {
      // Deselect all cards, then select the clicked one
      document.querySelectorAll('.room-size-card').forEach(function (c) {
        c.classList.remove('selected');
      });
      this.classList.add('selected');
      document.getElementById('roomSize').value = this.getAttribute('data-value');

      // Auto-populate occupancy based on the chosen room size
      var occupancyMap = { huddle: 4, small: 6, medium: 12, large: 20 };
      var occupancy = occupancyMap[this.getAttribute('data-value')];
      if (occupancy) {
        document.getElementById('occupancy').value = occupancy;
      }
    });
  });

  // -----------------------------------------------------------------------
  // Platform card selector
  // -----------------------------------------------------------------------

  document.querySelectorAll('.platform-card').forEach(function (card) {
    card.addEventListener('click', function () {
      document.querySelectorAll('.platform-card').forEach(function (c) {
        c.classList.remove('selected');
      });
      this.classList.add('selected');
      document.getElementById('conferencingPlatform').value = this.getAttribute('data-value');
    });
  });

  // -----------------------------------------------------------------------
  // File upload preview
  // -----------------------------------------------------------------------

  document.getElementById('roomPhotos').addEventListener('change', function (e) {
    var files = Array.from(e.target.files);
    var preview = document.getElementById('filePreview');
    var maxFileSize = 100 * 1024 * 1024; // 100 MB

    files.forEach(function (file) {
      if (file.size > maxFileSize) {
        alert('File ' + file.name + ' is too large. Maximum size is 100 MB.');
        return;
      }

      uploadedFiles.push(file);

      var fileDiv = document.createElement('div');
      fileDiv.style.cssText =
        'border: 2px solid #E81123; border-radius: 4px; padding: 10px; background: #fff5f6; text-align: center;';

      if (file.type.startsWith('image/')) {
        var img = document.createElement('img');
        img.style.cssText =
          'width: 100%; height: 100px; object-fit: cover; border-radius: 4px; margin-bottom: 5px;';
        img.src = URL.createObjectURL(file);
        fileDiv.appendChild(img);
      } else if (file.type.startsWith('video/')) {
        var video = document.createElement('video');
        video.style.cssText =
          'width: 100%; height: 100px; object-fit: cover; border-radius: 4px; margin-bottom: 5px;';
        video.src = URL.createObjectURL(file);
        fileDiv.appendChild(video);
      }

      var fileName = document.createElement('p');
      fileName.style.cssText =
        'font-size: 0.8em; margin: 0; color: #000; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
      fileName.textContent = file.name;
      fileDiv.appendChild(fileName);

      var fileSize = document.createElement('p');
      fileSize.style.cssText = 'font-size: 0.7em; margin: 5px 0 0 0; color: #58595B;';
      fileSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      fileDiv.appendChild(fileSize);

      preview.appendChild(fileDiv);
    });
  });

  // -----------------------------------------------------------------------
  // Checkbox item click delegation
  // -----------------------------------------------------------------------

  document.querySelectorAll('.checkbox-item').forEach(function (item) {
    item.addEventListener('click', function (e) {
      // Skip if the user clicked directly on the checkbox or its label
      if (e.target.type === 'checkbox' || e.target.tagName === 'LABEL') {
        return;
      }
      var checkbox = this.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
      }
    });
  });

  // -----------------------------------------------------------------------
  // Form data helpers
  // -----------------------------------------------------------------------

  /**
   * Collect all current form values into a plain object.
   * Multi-value fields (checkboxes with the same name) are aggregated into arrays.
   * @returns {Object}
   */
  function collectFormData() {
    var form = document.getElementById('avSurveyForm');
    var formData = new FormData(form);
    var roomData = {};

    for (var pair of formData.entries()) {
      var key = pair[0];
      var value = pair[1];
      if (roomData[key]) {
        if (Array.isArray(roomData[key])) {
          roomData[key].push(value);
        } else {
          roomData[key] = [roomData[key], value];
        }
      } else {
        roomData[key] = value;
      }
    }
    return roomData;
  }

  /**
   * Validate that required fields for the current room are present.
   * @param {Object} data - Collected form data.
   * @returns {boolean}
   */
  function validateCurrentRoom(data) {
    var requiredFields = [
      'projectName',
      'surveyDate',
      'surveyorName',
      'siteAddress',
      'backgroundCheck',
      'safetyTraining',
      'unionLabor',
      'roomName',
      'roomSize',
      'conferencingPlatform',
      'ppeRequirements',
    ];

    var allPresent = requiredFields.every(function (field) {
      return data[field] && data[field].toString().trim();
    });

    if (!allPresent) return false;

    // At least one access consideration or a written description must be provided
    if (!data.accessConsiderations && !(data.otherAccessDetails && data.otherAccessDetails.toString().trim())) {
      return false;
    }

    return true;
  }

  /** Fields that belong to the project/site level and are shared across rooms. */
  var globalFields = [
    'projectName',
    'surveyDate',
    'surveyorName',
    'clientName',
    'clientContactName',
    'clientContactTitle',
    'clientContactPhone',
    'clientContactEmail',
    'siteAddress',
    'backgroundCheck',
    'safetyTraining',
    'unionLabor',
    'accessConsiderations',
    'otherAccessDetails',
    'ppeRequirements',
  ];

  /**
   * Extract room-only data from form data by removing global (project/site) fields.
   * @param {Object} formData
   * @returns {Object}
   */
  function extractRoomData(formData) {
    var roomData = Object.assign({}, formData);
    globalFields.forEach(function (field) {
      delete roomData[field];
    });
    return roomData;
  }

  // -----------------------------------------------------------------------
  // Multi-room management
  // -----------------------------------------------------------------------

  /**
   * Render the saved-rooms summary list above the current room form.
   */
  function updateRoomsDisplay() {
    var container = document.getElementById('roomsContainer');
    container.innerHTML = '';

    savedRooms.forEach(function (room, index) {
      var roomDiv = document.createElement('div');
      roomDiv.className = 'room-summary';
      roomDiv.innerHTML =
        '<h3>' +
        (room.roomName || 'Room ' + (index + 1)) +
        '<button type="button" class="btn-remove" data-index="' +
        index +
        '">Remove</button>' +
        '</h3>' +
        '<div class="room-summary-content">' +
        '<div class="room-summary-item"><strong>Size:</strong> ' + formatRoomSize(room.roomSize) + '</div>' +
        '<div class="room-summary-item"><strong>Platform:</strong> ' + formatPlatform(room.conferencingPlatform) + '</div>' +
        '<div class="room-summary-item"><strong>Occupancy:</strong> ' + (room.occupancy || 'N/A') + ' people</div>' +
        '<div class="room-summary-item"><strong>Dimensions:</strong> ' + (room.roomLength || 'N/A') + ' x ' + (room.roomWidth || 'N/A') + ' ft</div>' +
        '<div class="room-summary-item"><strong>Building/Floor:</strong> ' + (room.buildingFloor || 'N/A') + '</div>' +
        '<div class="room-summary-item"><strong>Display:</strong> ' + (room.displayType || 'N/A') + '</div>' +
        '</div>';
      container.appendChild(roomDiv);
    });

    // Attach remove-button handlers via delegation
    container.querySelectorAll('.btn-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(this.getAttribute('data-index'), 10);
        if (confirm('Are you sure you want to remove this room from the survey?')) {
          savedRooms.splice(idx, 1);
          updateRoomsDisplay();
        }
      });
    });
  }

  /**
   * Update the current-room indicator text.
   */
  function updateRoomIndicator() {
    document.getElementById('roomIndicator').textContent =
      'Room ' + currentRoomIndex + ' - New Room Survey';
  }

  /**
   * Clear room-specific fields while preserving project/site-level values.
   */
  function clearRoomFields() {
    var form = document.getElementById('avSurveyForm');

    // Capture persistent (project/site) field values before reset
    var persistentIds = [
      'projectName', 'surveyDate', 'surveyorName', 'clientName',
      'clientContactName', 'clientContactTitle', 'clientContactPhone',
      'clientContactEmail', 'siteAddress', 'backgroundCheck',
      'safetyTraining', 'unionLabor', 'otherAccessDetails',
      'accessParking', 'accessBadging', 'accessEscort',
      'ppeGlasses', 'ppeHardHat', 'ppeSteelToe', 'ppeNone',
    ];

    var saved = {};
    persistentIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        saved[id] = el.type === 'checkbox' ? el.checked : el.value;
      }
    });

    form.reset();

    // Restore persistent values
    Object.keys(saved).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (typeof saved[id] === 'boolean') {
        el.checked = saved[id];
      } else {
        el.value = saved[id];
      }
    });

    // Reset visual selection states for cards
    document.querySelectorAll('.room-size-card.selected, .platform-card.selected').forEach(function (card) {
      card.classList.remove('selected');
    });
    document.getElementById('roomSize').value = '';
    document.getElementById('conferencingPlatform').value = '';
  }

  // -----------------------------------------------------------------------
  // "Add Another Room" button handler
  // -----------------------------------------------------------------------

  /**
   * Save the current room and reset the form for a new room entry.
   * Exposed on `window` so the inline onclick attribute in the HTML can call it.
   */
  window.addAnotherRoom = function () {
    var formData = collectFormData();

    if (!validateCurrentRoom(formData)) {
      alert('Please complete all required fields before adding another room.');
      return;
    }

    savedRooms.push(extractRoomData(formData));
    updateRoomsDisplay();
    clearRoomFields();
    currentRoomIndex++;
    updateRoomIndicator();
  };

  // -----------------------------------------------------------------------
  // "Save as Draft" button handler
  // -----------------------------------------------------------------------

  /**
   * Download the current survey state (all saved rooms + current room) as a JSON file.
   * Exposed on `window` for the inline onclick attribute.
   */
  window.saveAsDraft = function () {
    var allRoomData = {
      savedRooms: savedRooms,
      currentRoom: collectFormData(),
      timestamp: new Date().toISOString(),
    };
    var blob = new Blob([JSON.stringify(allRoomData, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'av-survey-draft-' + new Date().toISOString().split('T')[0] + '.json';
    link.click();
    URL.revokeObjectURL(url);
    alert('Survey draft saved successfully!');
  };

  // -----------------------------------------------------------------------
  // Form submission
  // -----------------------------------------------------------------------

  document.getElementById('avSurveyForm').addEventListener('submit', function (e) {
    e.preventDefault();

    var currentFormData = collectFormData();
    var hasCurrentRoomData = currentFormData.roomName && currentFormData.roomName.trim();

    // If the user has room data in the current form, validate and include it
    if (hasCurrentRoomData) {
      if (!validateCurrentRoom(currentFormData)) {
        alert('Please complete all required fields for the current room.');
        return;
      }
      savedRooms.push(extractRoomData(currentFormData));
    }

    if (savedRooms.length === 0) {
      alert('Please add at least one room to generate the survey report.');
      return;
    }

    // Separate project-level and site-level data from the form
    var projectData = {
      projectName: currentFormData.projectName,
      surveyDate: currentFormData.surveyDate,
      surveyorName: currentFormData.surveyorName,
      clientName: currentFormData.clientName,
      clientContactName: currentFormData.clientContactName,
      clientContactTitle: currentFormData.clientContactTitle,
      clientContactPhone: currentFormData.clientContactPhone,
      clientContactEmail: currentFormData.clientContactEmail,
    };

    var siteData = {
      siteAddress: currentFormData.siteAddress,
      accessConsiderations: currentFormData.accessConsiderations || null,
      otherAccessDetails: currentFormData.otherAccessDetails,
      ppeRequirements: currentFormData.ppeRequirements || null,
      backgroundCheck: currentFormData.backgroundCheck,
      safetyTraining: currentFormData.safetyTraining,
      unionLabor: currentFormData.unionLabor,
    };

    submitSurvey(projectData, siteData, savedRooms);
  });

  /**
   * POST the completed survey to the server.
   *
   * @param {Object} projectInfo
   * @param {Object} siteInfo
   * @param {Object[]} rooms
   */
  async function submitSurvey(projectInfo, siteInfo, rooms) {
    var submitBtn = document.querySelector('.btn-primary');
    submitBtn.textContent = 'Uploading...';
    submitBtn.disabled = true;

    try {
      var formData = new FormData();
      formData.append('projectInfo', JSON.stringify(projectInfo));
      formData.append('siteInfo', JSON.stringify(siteInfo));
      formData.append('rooms', JSON.stringify(rooms));

      // Attach all uploaded media files
      uploadedFiles.forEach(function (file) {
        formData.append('photos', file);
      });

      var response = await fetch('/api/submit-survey', {
        method: 'POST',
        body: formData, // Browser sets multipart Content-Type automatically
      });

      var result = await response.json();

      if (result.success) {
        alert('Survey submitted successfully! Report files have been generated and saved.');

        // Reset all state for a fresh survey
        savedRooms = [];
        currentRoomIndex = 1;
        uploadedFiles = [];
        document.getElementById('avSurveyForm').reset();
        document.getElementById('filePreview').innerHTML = '';
        updateRoomsDisplay();
        updateRoomIndicator();
      } else {
        throw new Error(result.error || 'Submission failed');
      }
    } catch (error) {
      console.error('Error submitting survey:', error);
      alert('Error submitting survey: ' + error.message);
    } finally {
      submitBtn.textContent = 'Generate Survey Report';
      submitBtn.disabled = false;
    }
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', function () {
    // Default the survey date to today
    var today = new Date().toISOString().split('T')[0];
    document.getElementById('surveyDate').value = today;

    // Set the copyright year in the footer
    var yearEl = document.getElementById('currentYear');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  });
})();
