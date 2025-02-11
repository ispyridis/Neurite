function determineGlobalModel() {
    const inferenceSelect = document.getElementById('inference-select');
    const openAiSelect = document.getElementById('open-ai-select');
    const groqSelect = document.getElementById('groq-select');
    const localModelSelect = document.getElementById('local-model-select');
    const customModelSelect = document.getElementById('custom-model-select');
    const provider = inferenceSelect.value;

    let model = '';

    if (provider === 'OpenAi') {
        model = openAiSelect.value;
    } else if (provider === 'GROQ') {
        model = groqSelect.value;
    } else if (provider === 'ollama') {
        model = localModelSelect.value;
    } else if (provider === 'custom') {
        const selectedOption = customModelSelect.options[customModelSelect.selectedIndex];
        model = selectedOption.text;
    }

    return { provider, model };
}


function determineAiNodeModel(node) {
    const inferenceSelect = node.inferenceSelect;
    const openAiSelect = node.openAiSelect;
    const groqSelect = node.groqSelect;
    const localModelSelect = node.localModelSelect;
    const customModelSelect = node.customModelSelect;
    const provider = inferenceSelect.value;

    let model = '';

    if (provider === 'OpenAi') {
        model = openAiSelect.value;
    } else if (provider === 'GROQ') {
        model = groqSelect.value;
    } else if (provider === 'ollama') {
        model = localModelSelect.value;
    } else if (provider === 'custom') {
        const selectedOption = customModelSelect.options[customModelSelect.selectedIndex];
        model = selectedOption.text;
    }

    return { provider, model };
}

const TOKEN_COST_PER_IMAGE = 200; // Flat token cost assumption for each image


function getTokenCount(messages) {
    let tokenCount = 0;
    messages.forEach(message => {
        // Check if content is a string (text message)
        if (typeof message.content === 'string') {
            let tokens = message.content.match(/[\w]+|[^\s\w]/g);
            tokenCount += tokens ? tokens.length : 0;
        }
        // If content is an array, we look for text entries to count tokens
        else if (Array.isArray(message.content)) {
            message.content.forEach(item => {
                // Only count tokens for text entries
                if (item.type === 'text' && typeof item.text === 'string') {
                    let tokens = item.text.match(/[\w]+|[^\s\w]/g);
                    tokenCount += tokens ? tokens.length : 0;
                }
                // For image entries, we need to add the predefined token cost
                if (item.type === 'image_url') {
                    // Add the token cost for images
                    tokenCount += TOKEN_COST_PER_IMAGE;
                }
            });
        }
    });
    return tokenCount;
}

function ensureClosedBackticks(text) {
    const backtickCount = (text.match(/```/g) || []).length;
    if (backtickCount % 2 !== 0) {
        text += '```'; // Close the unclosed triple backticks
    }
    return text;
}

function handleUserPromptAppend(element, userMessage, promptIdentifier) {
    // Ensure no unclosed triple backticks in the current content
    element.value = ensureClosedBackticks(element.value);

    // Append the user prompt to the AI response area with a distinguishing mark and end tag
    element.value += `\n\n${promptIdentifier} ${userMessage}\n`;

    // Trigger the input event programmatically
    element.dispatchEvent(new Event('input'));
}

function handleUserPromptAppendCodeMirror(editor, userMessage, promptIdentifier) {
    const doc = editor.getDoc();
    let currentText = doc.getValue();
    const lineBeforeAppend = doc.lineCount();

    // Ensure no unclosed triple backticks in the current content
    currentText = ensureClosedBackticks(currentText);
    doc.setValue(currentText);

    // Append the user prompt to the CodeMirror editor
    editor.replaceRange(`\n\n${promptIdentifier} ${userMessage}\n`, { line: lineBeforeAppend, ch: 0 });
}




function getLastPromptsAndResponses(count, maxTokens, textareaId = "note-input") {
    const lines = document.getElementById(textareaId).value.split("\n");
    const promptsAndResponses = [];
    let promptCount = 0;
    let tokenCount = 0;

    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].startsWith(`${PROMPT_IDENTIFIER}`)) {
            promptCount++;
        }
        if (promptCount > count) {
            break;
        }
        tokenCount += lines[i].split(/\s+/).length;
        promptsAndResponses.unshift(lines[i]);
    }

    while (tokenCount > maxTokens) {
        const removedLine = promptsAndResponses.shift();
        tokenCount -= removedLine.split(/\s+/).length;
    }

    const lastPromptsAndResponses = promptsAndResponses.join("\n") + "\n";
    // console.log("Last prompts and responses:", lastPromptsAndResponses);
    return lastPromptsAndResponses;
}

function removeLastResponse() {
    const noteInput = document.getElementById("note-input");
    const lines = noteInput.value.split("\n");

    // Find the index of the last "Prompt:"
    let lastPromptIndex = lines.length - 1;
    while (lastPromptIndex >= 0 && !lines[lastPromptIndex].startsWith(`${PROMPT_IDENTIFIER}`)) {
        lastPromptIndex--;
    }

    // Remove all lines from the last "Prompt:" to the end
    if (lastPromptIndex >= 0) {
        lines.splice(lastPromptIndex, lines.length - lastPromptIndex);
        noteInput.value = lines.join("\n");

        // Update the CodeMirror instance with the new value
        myCodeMirror.setValue(noteInput.value);
    }
}

function haltResponse() {
    if (aiResponding) {
        // AI is responding, so we want to stop it
        if (currentController) {
            currentController.abort(); // Ensure you use the correct controller instance
        }
        aiResponding = false;
        shouldContinue = false;
        isFirstAutoModeMessage = true;

        // UI updates, ensure they are always executed
        document.querySelector('#regen-button use').setAttribute('xlink:href', '#refresh-icon');
        document.getElementById("prompt").value = latestUserMessage; // Use the last user message as prompt
    }
}

function regenerateResponse() {
    if (!aiResponding) {
        // AI is not responding, so we want to regenerate
        removeLastResponse(); // Remove the last AI response
        document.getElementById("prompt").value = latestUserMessage; // Restore the last user message into the input prompt
        document.querySelector('#regen-button use').setAttribute('xlink:href', '#refresh-icon');

    }
}

document.getElementById("regen-button").addEventListener("click", function () {
    if (aiResponding) {
        haltResponse();
    } else {
        regenerateResponse();
    }
});


// Extract the prompt from the last message
function extractLastPrompt() {
    const lastMessage = getLastPromptsAndResponses(1, 400);
    const promptRegex = new RegExp(`${PROMPT_IDENTIFIER}\\s*(.*)`, "i");
    const match = promptRegex.exec(lastMessage);

    if (match) {
        return match[1].trim();
    } else {
        console.warn("Prompt not found in the last message. Sending with a blank prompt.");
        return ""; // Return blank if prompt isn't found
    }
}


//ainodes.js


function trimToTokenCount(inputText, maxTokens) {
    let tokens = inputText.match(/[\w]+|[^\s\w]/g);
    let trimmedText = '';
    let currentTokenCount = 0;

    if (tokens !== null) {
        for (let token of tokens) {
            currentTokenCount += 1;
            if (currentTokenCount <= maxTokens) {
                trimmedText += token + ' ';
            } else {
                break;
            }
        }
    }

    return trimmedText;
}

async function getLastLineFromTextArea(textArea) {
    const text = textArea.value;
    const lines = text.split('\n');
    return lines[lines.length - 1];
}

// Function to extract text within quotations
async function getQuotedText(text) {
    const regex = /"([^"]*)"/g;
    let matches = [];
    let match;
    while (match = regex.exec(text)) {
        matches.push(match[1]);
    }
    return matches.length ? matches : null;
}