// ./features/actionMenu.js
const vscode = require('vscode');
const { t } = require('../i18n'); // 🌍 Importeer de vertaalfunctie

async function showActionMenu() {
    // Hier definiëren we alle tools met hun bijbehorende kleurrijke emoji's
    const items = [
        {
            label: t('MENU_LBL_EXTRACT'),
            description: t('MENU_CAT_REFACTOR'),
            detail: t('MENU_DET_EXTRACT'),
            command: 'mispl.extractVariable'
        },
        {
            label: t('MENU_LBL_DEBUG'),
            description: t('MENU_CAT_LOG'),
            detail: t('MENU_DET_DEBUG'),
            command: 'mispl.magicDebug'
        },
        {
            label: t('MENU_LBL_WRAP'),
            description: t('MENU_CAT_CODE'),
            detail: t('MENU_DET_WRAP'),
            command: 'mispl.wrapInBlock'
        },
        {
            label: t('MENU_LBL_ALIGN'),
            description: t('MENU_CAT_FORMAT'),
            detail: t('MENU_DET_ALIGN'),
            command: 'mispl.alignAssignments'
        },
        {
            label: t('MENU_LBL_UNUSED'),
            description: t('MENU_CAT_CLEAN'),
            detail: t('MENU_DET_UNUSED'),
            command: 'mispl.removeUnusedVariables'
        },
        {
            label: t('MENU_LBL_REPLACE'),
            description: t('MENU_CAT_CLEAN'),
            detail: t('MENU_DET_REPLACE'),
            command: 'mispl.replaceWords'
        },
        {
            label: t('MENU_LBL_COMPACT'),
            description: t('MENU_CAT_PROD'),
            detail: t('MENU_DET_COMPACT'),
            command: 'mispl.compactCode'
        },
        {
            label: t('MENU_LBL_MINIFIER'),
            description: t('MENU_CAT_PROD'),
            detail: t('MENU_DET_MINIFIER'),
            command: 'mispl.minifier'
        },
        {
            label: t('MENU_LBL_FLOW'),
            description: t('MENU_CAT_VIS'),
            detail: t('MENU_DET_FLOW'),
            command: 'mispl.showFlowchart'
        },
        {
            label: t('MENU_LBL_FLOW_SEL'),
            description: t('MENU_CAT_VIS'),
            detail: t('MENU_DET_FLOW_SEL'),
            command: 'mispl.showSelectedFlowchart'
        },
        {
            label: t('MENU_LBL_INJECT'),
            description: t('MENU_CAT_TEST'),
            detail: t('MENU_DET_INJECT'),
            command: 'mispl.injectValidationFlow'
        },
        {
            label: t('MENU_LBL_COVERAGE'),
            description: t('MENU_CAT_TEST'),
            detail: t('MENU_DET_COVERAGE'),
            command: 'mispl.analyzeCoverage'
        },
        {
            label: t('MENU_LBL_REMOVE_FLOW'),
            description: t('MENU_CAT_TEST'),
            detail: t('MENU_DET_REMOVE_FLOW'),
            command: 'mispl.removeValidationFlow'
        }
    ];

    const options = {
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: t('MENU_PLACEHOLDER')
    };

    // Toon het menu aan de gebruiker
    const selected = await vscode.window.showQuickPick(items, options);

    // Voer het gekozen commando uit
    if (selected) {
        vscode.commands.executeCommand(selected.command);
    }
}

// Deze functie maakt het knopje rechtsonder in de blauwe statusbalk aan
function createStatusBarItem(context) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'mispl.showActionMenu';
    // Let op: In de statusbalk zélf houden we wel de monochrome $(tools) van VS Code, 
    // want emoji's in de statusbalk breken soms de uitlijning van het hele venster!
    statusBarItem.text = '$(tools) MISPL Tools';
    statusBarItem.tooltip = t('STATUSBAR_TOOLTIP');
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

module.exports = { showActionMenu, createStatusBarItem };