/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { OperatingSystem } from 'vs/base/common/platform';
import { SimpleKeybinding, KeyCode, ResolvedKeybinding, Keybinding, KeyCodeUtils } from 'vs/base/common/keyCodes';
import { KeyboardEventCode, KeyboardEventCodeUtils } from 'vs/workbench/services/keybinding/common/keyboardEventCode';
import { CharCode } from 'vs/base/common/charCode';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/abstractKeybindingService';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { PrintableKeypress, UILabelProvider, AriaLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';

export interface IKeyMapping {
	value: string;
	withShift: string;
	withAltGr: string;
	withShiftAltGr: string;

	valueIsDeadKey?: boolean;
	withShiftIsDeadKey?: boolean;
	withAltGrIsDeadKey?: boolean;
	withShiftAltGrIsDeadKey?: boolean;
}

export interface IKeyboardMapping {
	[code: string]: IKeyMapping;
}

const LOG = false;
function log(str: string): void {
	if (LOG) {
		console.info(str);
	}
}

function cannotMapSimpleKeybinding(keybinding: SimpleKeybinding, OS: OperatingSystem, reason: string): void {
	let usLayout = new USLayoutResolvedKeybinding(keybinding, OS);
	log(`No key combination can produce desired simple keybinding: ${usLayout.getUserSettingsLabel()} - ${reason}.`);
}

/**
 * -1 if a KeyCode => keyboardEvent.code mapping depends on kb layout.
 */
const IMMUTABLE_KEY_CODE_TO_CODE: KeyboardEventCode[] = [];
const IMMUTABLE_CODE_TO_KEY_CODE: KeyCode[] = [];

/**
 * Chars that will be remapped.
 */
const REMAP_CHARS = [
	CharCode.a, CharCode.b, CharCode.c, CharCode.d, CharCode.e, CharCode.f, CharCode.g,
	CharCode.h, CharCode.i, CharCode.j, CharCode.k, CharCode.l, CharCode.m, CharCode.n,
	CharCode.o, CharCode.p, CharCode.q, CharCode.r, CharCode.s, CharCode.t, CharCode.u,
	CharCode.v, CharCode.w, CharCode.x, CharCode.y, CharCode.z,

	CharCode.A, CharCode.B, CharCode.C, CharCode.D, CharCode.E, CharCode.F, CharCode.G,
	CharCode.H, CharCode.I, CharCode.J, CharCode.K, CharCode.L, CharCode.M, CharCode.N,
	CharCode.O, CharCode.P, CharCode.Q, CharCode.R, CharCode.S, CharCode.T, CharCode.U,
	CharCode.V, CharCode.W, CharCode.X, CharCode.Y, CharCode.Z,

	CharCode.Semicolon, CharCode.Colon,
	CharCode.Equals, CharCode.Plus,
	CharCode.Comma, CharCode.LessThan,
	CharCode.Dash, CharCode.Underline,
	CharCode.Period, CharCode.GreaterThan,
	CharCode.Slash, CharCode.QuestionMark,
	CharCode.BackTick, CharCode.Tilde,
	CharCode.OpenSquareBracket, CharCode.OpenCurlyBrace,
	CharCode.Backslash, CharCode.Pipe,
	CharCode.CloseSquareBracket, CharCode.CloseCurlyBrace,
	CharCode.SingleQuote, CharCode.DoubleQuote,
];

const REMAP_KEYBOARD_EVENT_CODES = [
	KeyboardEventCode.KeyA,
	KeyboardEventCode.KeyB,
	KeyboardEventCode.KeyC,
	KeyboardEventCode.KeyD,
	KeyboardEventCode.KeyE,
	KeyboardEventCode.KeyF,
	KeyboardEventCode.KeyG,
	KeyboardEventCode.KeyH,
	KeyboardEventCode.KeyI,
	KeyboardEventCode.KeyJ,
	KeyboardEventCode.KeyK,
	KeyboardEventCode.KeyL,
	KeyboardEventCode.KeyM,
	KeyboardEventCode.KeyN,
	KeyboardEventCode.KeyO,
	KeyboardEventCode.KeyP,
	KeyboardEventCode.KeyQ,
	KeyboardEventCode.KeyR,
	KeyboardEventCode.KeyS,
	KeyboardEventCode.KeyT,
	KeyboardEventCode.KeyU,
	KeyboardEventCode.KeyV,
	KeyboardEventCode.KeyW,
	KeyboardEventCode.KeyX,
	KeyboardEventCode.KeyY,
	KeyboardEventCode.KeyZ,
	KeyboardEventCode.Digit1,
	KeyboardEventCode.Digit2,
	KeyboardEventCode.Digit3,
	KeyboardEventCode.Digit4,
	KeyboardEventCode.Digit5,
	KeyboardEventCode.Digit6,
	KeyboardEventCode.Digit7,
	KeyboardEventCode.Digit8,
	KeyboardEventCode.Digit9,
	KeyboardEventCode.Digit0,
	KeyboardEventCode.Minus,
	KeyboardEventCode.Equal,
	KeyboardEventCode.BracketLeft,
	KeyboardEventCode.BracketRight,
	KeyboardEventCode.Backslash,
	KeyboardEventCode.IntlHash,
	KeyboardEventCode.Semicolon,
	KeyboardEventCode.Quote,
	KeyboardEventCode.Backquote,
	KeyboardEventCode.Comma,
	KeyboardEventCode.Period,
	KeyboardEventCode.Slash,
	KeyboardEventCode.IntlBackslash
];

const enum ModifierState {
	None = 0,
	Shift = 1,
	AltGr = 2,
	ShiftAltGr = 3
}

export class HardwareKeypress {
	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly code: KeyboardEventCode;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, code: KeyboardEventCode) {
		this.ctrlKey = ctrlKey;
		this.shiftKey = shiftKey;
		this.altKey = altKey;
		this.metaKey = metaKey;
		this.code = code;
	}

	public toPrintableKeypress(key: string): PrintableKeypress {
		return new PrintableKeypress(this.ctrlKey, this.shiftKey, this.altKey, this.metaKey, key);
	}
}

export class NativeResolvedKeybinding extends ResolvedKeybinding {

	private readonly _mapper: KeyboardMapper;
	private readonly _OS: OperatingSystem;
	private readonly _firstPart: HardwareKeypress;
	private readonly _chordPart: HardwareKeypress;

	constructor(mapper: KeyboardMapper, OS: OperatingSystem, firstPart: HardwareKeypress, chordPart: HardwareKeypress) {
		super();
		this._mapper = mapper;
		this._OS = OS;
		this._firstPart = firstPart;
		this._chordPart = chordPart;
	}

	public getLabel(): string {
		let firstPart = this._firstPart.toPrintableKeypress(this._mapper.getUILabelForHardwareCode(this._firstPart.code));
		let chordPart = this._chordPart ? this._chordPart.toPrintableKeypress(this._mapper.getUILabelForHardwareCode(this._chordPart.code)) : null;

		return UILabelProvider.toLabel2(firstPart, chordPart, this._OS);
	}

	public getAriaLabel(): string {
		let firstPart = this._firstPart.toPrintableKeypress(this._mapper.getAriaLabelForHardwareCode(this._firstPart.code));
		let chordPart = this._chordPart ? this._chordPart.toPrintableKeypress(this._mapper.getAriaLabelForHardwareCode(this._chordPart.code)) : null;

		return AriaLabelProvider.toLabel2(firstPart, chordPart, this._OS);
	}

	public getHTMLLabel(): IHTMLContentElement[] {
		let firstPart = this._firstPart.toPrintableKeypress(this._mapper.getUILabelForHardwareCode(this._firstPart.code));
		let chordPart = this._chordPart ? this._chordPart.toPrintableKeypress(this._mapper.getUILabelForHardwareCode(this._chordPart.code)) : null;

		return UILabelProvider.toHTMLLabel2(firstPart, chordPart, this._OS);
	}

	public getElectronAccelerator(): string {
		throw new Error('TODO!');
		// const usResolvedKeybinding = new USLayoutResolvedKeybinding(this._actual, OS);

		// if (OS === OperatingSystem.Windows) {
		// 	// electron menus always do the correct rendering on Windows
		// 	return usResolvedKeybinding.getElectronAccelerator();
		// }

		// let usLabel = usResolvedKeybinding.getLabel();
		// let label = this.getLabel();
		// if (usLabel !== label) {
		// 	// electron menus are incorrect in rendering (linux) and in rendering and interpreting (mac)
		// 	// for non US standard keyboard layouts
		// 	return null;
		// }

		// return usResolvedKeybinding.getElectronAccelerator();
	}

	public getUserSettingsLabel(): string {
		throw new Error('TODO!');
		// return KeybindingIO.writeKeybinding(this._actual, OS);
	}
}

interface IHardwareCodeMapping {
	value: number;
	withShift: number;
	withAltGr: number;
	withShiftAltGr: number;

	valueIsDeadKey: boolean;
	withShiftIsDeadKey: boolean;
	withAltGrIsDeadKey: boolean;
	withShiftAltGrIsDeadKey: boolean;
}

export class KeyboardMapper {

	private readonly _OS: OperatingSystem;
	private readonly _remapChars: HardwareKeypress[][];
	private readonly _mappings: IHardwareCodeMapping[];

	constructor(mappings: IKeyboardMapping, OS: OperatingSystem) {

		this._remapChars = [];
		let maxCharCode = REMAP_CHARS.reduce((prev, curr) => Math.max(prev, curr));
		for (let i = 0; i <= maxCharCode; i++) {
			this._remapChars[i] = null;
		}

		this._mappings = [];
		for (let strCode in mappings) {
			if (mappings.hasOwnProperty(strCode)) {
				const code = KeyboardEventCodeUtils.toEnum(strCode);
				if (code === KeyboardEventCode.None) {
					log(`Unknown code ${strCode} in mapping.`);
					continue;
				}

				const mapping = mappings[strCode];
				const value = KeyboardMapper._getCharCode(mapping.value);
				const withShift = KeyboardMapper._getCharCode(mapping.withShift);
				const withAltGr = KeyboardMapper._getCharCode(mapping.withAltGr);
				const withShiftAltGr = KeyboardMapper._getCharCode(mapping.withShiftAltGr);

				this._mappings[code] = {
					value: value,
					withShift: withShift,
					withAltGr: withAltGr,
					withShiftAltGr: withShiftAltGr,

					valueIsDeadKey: mapping.valueIsDeadKey,
					withShiftIsDeadKey: mapping.withShiftIsDeadKey,
					withAltGrIsDeadKey: mapping.withAltGrIsDeadKey,
					withShiftAltGrIsDeadKey: mapping.withShiftAltGrIsDeadKey,
				};

				this._register(code, false, false, false, value);
				this._register(code, false, true, false, withShift);
				this._register(code, true, false, true, withAltGr);
				this._register(code, true, true, true, withShiftAltGr);
			}
		}

		this._OS = OS;

		for (let i = 0; i < REMAP_CHARS.length; i++) {
			const charCode = REMAP_CHARS[i];
			let combos = this._remapChars[charCode];
			if (combos === null) {
				log(`Could not find any key combination producing '${String.fromCharCode(charCode)}'`);
			} else if (combos.length > 1) {
				combos.sort((a, b) => {
					let aModCnt = (a.ctrlKey ? 1 : 0) + (a.altKey ? 1 : 0) + (a.shiftKey ? 1 : 0) + (a.metaKey ? 1 : 0);
					let bModCnt = (b.ctrlKey ? 1 : 0) + (b.altKey ? 1 : 0) + (b.shiftKey ? 1 : 0) + (b.metaKey ? 1 : 0);
					if (aModCnt === bModCnt) {
						return a.code - b.code;
					}
					return aModCnt - bModCnt;
				});
			}
		}
	}

	private static _getCharCode(char: string): number {
		if (char.length === 0) {
			return 0;
		}
		return this._combiningToRegularCharCode(char.charCodeAt(0));
	}

	/**
	 * Attempt to map a combining character to a regular one that renders the same way.
	 *
	 * To the brave person following me: Good Luck!
	 * https://www.compart.com/en/unicode/bidiclass/NSM
	 */
	private static _combiningToRegularCharCode(charCode: number): number {
		switch (charCode) {
			case CharCode.U_Combining_Grave_Accent: return CharCode.U_GRAVE_ACCENT;
			case CharCode.U_Combining_Acute_Accent: return CharCode.U_ACUTE_ACCENT;
			case CharCode.U_Combining_Circumflex_Accent: return CharCode.U_CIRCUMFLEX;
			case CharCode.U_Combining_Tilde: return CharCode.U_SMALL_TILDE;
			case CharCode.U_Combining_Macron: return CharCode.U_MACRON;
			case CharCode.U_Combining_Overline: return CharCode.U_OVERLINE;
			case CharCode.U_Combining_Breve: return CharCode.U_BREVE;
			case CharCode.U_Combining_Dot_Above: return CharCode.U_DOT_ABOVE;
			case CharCode.U_Combining_Diaeresis: return CharCode.U_DIAERESIS;
			case CharCode.U_Combining_Ring_Above: return CharCode.U_RING_ABOVE;
			case CharCode.U_Combining_Double_Acute_Accent: return CharCode.U_DOUBLE_ACUTE_ACCENT;
		}
		return charCode;
	}

	private _register(code: KeyboardEventCode, ctrlKey: boolean, shiftKey: boolean, altKey: boolean, charCode: number): void {
		if (charCode === 0) {
			return;
		}

		if (REMAP_CHARS.indexOf(charCode) === -1) {
			return;
		}
		if (REMAP_KEYBOARD_EVENT_CODES.indexOf(code) === -1) {
			return;
		}

		let entry = new HardwareKeypress(ctrlKey, shiftKey, altKey, false, code);

		if (this._remapChars[charCode] === null) {
			// no duplicates so far
			this._remapChars[charCode] = [entry];
			return;
		}

		const list = this._remapChars[charCode];
		// Do not register if it already sits under the same code
		for (let i = 0, len = list.length; i < len; i++) {
			if (list[i].code === code) {
				return;
			}
		}
		list.push(entry);
	}

	private _doMapSimpleKeybinding(source: SimpleKeybinding, keyCombo: HardwareKeypress, ctrlKey: boolean, altKey: boolean, metaKey: boolean, charCode: number): HardwareKeypress {
		if ((keyCombo.ctrlKey && ctrlKey) || (keyCombo.altKey && altKey)) {
			cannotMapSimpleKeybinding(source, this._OS, `ctrl or alt modifiers are needed to produce '${String.fromCharCode(charCode)}'`);
			return null;
		}

		const shiftKey = keyCombo.shiftKey;
		if (keyCombo.ctrlKey) {
			ctrlKey = true;
		}
		if (keyCombo.altKey) {
			altKey = true;
		}

		return new HardwareKeypress(ctrlKey, shiftKey, altKey, metaKey, keyCombo.code);
	}

	private _mapSimpleKeybinding(source: SimpleKeybinding, ctrlKey: boolean, altKey: boolean, metaKey: boolean, charCode: number): HardwareKeypress[] {
		const keyCombos = this._remapChars[charCode];

		let result: HardwareKeypress[] = [], resultLen = 0;
		if (keyCombos !== null) {
			for (let i = 0, len = keyCombos.length; i < len; i++) {
				const keyCombo = keyCombos[i];
				let oneResult = this._doMapSimpleKeybinding(source, keyCombo, ctrlKey, altKey, metaKey, charCode);
				if (oneResult !== null) {
					result[resultLen++] = oneResult;
				}
			}
		} else {
			cannotMapSimpleKeybinding(source, this._OS, `'${String.fromCharCode(charCode)}' cannot be produced`);
		}

		return result;
	}

	public mapSimpleKeybinding(keybinding: SimpleKeybinding): HardwareKeypress[] {
		const ctrlCmd = keybinding.hasCtrlCmd();
		const winCtrl = keybinding.hasWinCtrl();

		const ctrlKey = (this._OS === OperatingSystem.Macintosh ? winCtrl : ctrlCmd);
		const metaKey = (this._OS === OperatingSystem.Macintosh ? ctrlCmd : winCtrl);
		const shiftKey = keybinding.hasShift();
		const altKey = keybinding.hasAlt();
		const keyCode = keybinding.getKeyCode();

		if (IMMUTABLE_KEY_CODE_TO_CODE[keyCode] !== -1) {
			const keyboardEventCode = IMMUTABLE_KEY_CODE_TO_CODE[keyCode];
			return [new HardwareKeypress(ctrlKey, shiftKey, altKey, metaKey, keyboardEventCode)];
		}

		let desiredCharCode = 0;

		if (keyCode >= KeyCode.KEY_A && keyCode <= KeyCode.KEY_Z) {
			if (shiftKey) {
				desiredCharCode = CharCode.A + (keyCode - KeyCode.KEY_A);
			} else {
				desiredCharCode = CharCode.a + (keyCode - KeyCode.KEY_A);
			}
		} else {
			switch (keyCode) {
				case KeyCode.US_SEMICOLON:
					desiredCharCode = (!shiftKey ? CharCode.Semicolon : CharCode.Colon);
					break;
				case KeyCode.US_EQUAL:
					desiredCharCode = (!shiftKey ? CharCode.Equals : CharCode.Plus);
					break;
				case KeyCode.US_COMMA:
					desiredCharCode = (!shiftKey ? CharCode.Comma : CharCode.LessThan);
					break;
				case KeyCode.US_MINUS:
					desiredCharCode = (!shiftKey ? CharCode.Dash : CharCode.Underline);
					break;
				case KeyCode.US_DOT:
					desiredCharCode = (!shiftKey ? CharCode.Period : CharCode.GreaterThan);
					break;
				case KeyCode.US_SLASH:
					desiredCharCode = (!shiftKey ? CharCode.Slash : CharCode.QuestionMark);
					break;
				case KeyCode.US_BACKTICK:
					desiredCharCode = (!shiftKey ? CharCode.BackTick : CharCode.Tilde);
					break;
				case KeyCode.US_OPEN_SQUARE_BRACKET:
					desiredCharCode = (!shiftKey ? CharCode.OpenSquareBracket : CharCode.OpenCurlyBrace);
					break;
				case KeyCode.US_BACKSLASH:
					desiredCharCode = (!shiftKey ? CharCode.Backslash : CharCode.Pipe);
					break;
				case KeyCode.US_CLOSE_SQUARE_BRACKET:
					desiredCharCode = (!shiftKey ? CharCode.CloseSquareBracket : CharCode.CloseCurlyBrace);
					break;
				case KeyCode.US_QUOTE:
					desiredCharCode = (!shiftKey ? CharCode.SingleQuote : CharCode.DoubleQuote);
					break;
			}
		}

		if (desiredCharCode === 0) {
			// OEM_8 = 91,
			// OEM_102 = 92,
			cannotMapSimpleKeybinding(keybinding, this._OS, `unknown character`);
			return null;
		}

		return this._mapSimpleKeybinding(keybinding, ctrlKey, altKey, metaKey, desiredCharCode);
	}

	public getUILabelForHardwareCode(code: KeyboardEventCode): string {
		return this._getLabelForHardwareCode(code, true);
	}

	public getAriaLabelForHardwareCode(code: KeyboardEventCode): string {
		return this._getLabelForHardwareCode(code, false);
	}

	private _getLabelForHardwareCode(code: KeyboardEventCode, isUI: boolean): string {
		if (isUI && this._OS === OperatingSystem.Macintosh) {
			switch (code) {
				case KeyboardEventCode.ArrowLeft:
					return '←';
				case KeyboardEventCode.ArrowUp:
					return '↑';
				case KeyboardEventCode.ArrowRight:
					return '→';
				case KeyboardEventCode.ArrowDown:
					return '↓';
			}
		}
		if (IMMUTABLE_CODE_TO_KEY_CODE[code] !== -1) {
			const keyCode = IMMUTABLE_CODE_TO_KEY_CODE[code];
			return KeyCodeUtils.toString(keyCode);
		}

		const mapping = this._mappings[code];
		if (!mapping) {
			// uh-oh
			return 'Unknown';
		}

		if (mapping.value >= CharCode.a && mapping.value <= CharCode.z) {
			return String.fromCharCode(CharCode.A + (mapping.value - CharCode.a));
		}

		if (mapping.value) {
			return String.fromCharCode(mapping.value);
		}

		throw new Error('TODO!');
	}

	public resolveKeybinding(keybinding: Keybinding): NativeResolvedKeybinding[] {
		let result: NativeResolvedKeybinding[] = [], resultLen = 0;

		if (keybinding.isChord()) {
			const firstParts = this.mapSimpleKeybinding(keybinding.extractFirstPart());
			const chordParts = this.mapSimpleKeybinding(keybinding.extractChordPart());

			for (let i = 0, len = firstParts.length; i < len; i++) {
				const firstPart = firstParts[i];
				for (let j = 0, lenJ = chordParts.length; j < lenJ; j++) {
					const chordPart = chordParts[j];

					result[resultLen++] = new NativeResolvedKeybinding(this, this._OS, firstPart, chordPart);
				}
			}
		} else {
			const firstParts = this.mapSimpleKeybinding(keybinding);

			for (let i = 0, len = firstParts.length; i < len; i++) {
				const firstPart = firstParts[i];

				result[resultLen++] = new NativeResolvedKeybinding(this, this._OS, firstPart, null);
			}
		}

		return result;
	}
}

(function () {
	for (let i = 0; i <= KeyCode.MAX_VALUE; i++) {
		IMMUTABLE_KEY_CODE_TO_CODE[i] = -1;
	}
	for (let i = 0; i <= KeyboardEventCode.MAX_VALUE; i++) {
		IMMUTABLE_CODE_TO_KEY_CODE[i] = -1;
	}

	function d(keyCode: KeyCode, code: KeyboardEventCode): void {
		IMMUTABLE_KEY_CODE_TO_CODE[keyCode] = code;
		IMMUTABLE_CODE_TO_KEY_CODE[code] = keyCode;
	}

	// Unknown = 0,

	d(KeyCode.Backspace, KeyboardEventCode.Backspace);
	d(KeyCode.Tab, KeyboardEventCode.Tab);
	d(KeyCode.Enter, KeyboardEventCode.Enter);

	d(KeyCode.Shift, KeyboardEventCode.ShiftLeft);
	// TODO => ShiftLeft, ShiftRight

	d(KeyCode.Ctrl, KeyboardEventCode.ControlLeft);
	// TODO => ControlLeft, ControlRight

	d(KeyCode.Alt, KeyboardEventCode.AltLeft);
	// TODO => AltLeft, AltRight

	d(KeyCode.PauseBreak, KeyboardEventCode.Pause);
	d(KeyCode.CapsLock, KeyboardEventCode.CapsLock);
	d(KeyCode.Escape, KeyboardEventCode.Escape);
	d(KeyCode.Space, KeyboardEventCode.Space);
	d(KeyCode.PageUp, KeyboardEventCode.PageUp);
	d(KeyCode.PageDown, KeyboardEventCode.PageDown);
	d(KeyCode.End, KeyboardEventCode.End);
	d(KeyCode.Home, KeyboardEventCode.Home);
	d(KeyCode.LeftArrow, KeyboardEventCode.ArrowLeft);
	d(KeyCode.UpArrow, KeyboardEventCode.ArrowUp);
	d(KeyCode.RightArrow, KeyboardEventCode.ArrowRight);
	d(KeyCode.DownArrow, KeyboardEventCode.ArrowDown);
	d(KeyCode.Insert, KeyboardEventCode.Insert);
	d(KeyCode.Delete, KeyboardEventCode.Delete);

	d(KeyCode.KEY_0, KeyboardEventCode.Digit0);
	d(KeyCode.KEY_1, KeyboardEventCode.Digit1);
	d(KeyCode.KEY_2, KeyboardEventCode.Digit2);
	d(KeyCode.KEY_3, KeyboardEventCode.Digit3);
	d(KeyCode.KEY_4, KeyboardEventCode.Digit4);
	d(KeyCode.KEY_5, KeyboardEventCode.Digit5);
	d(KeyCode.KEY_6, KeyboardEventCode.Digit6);
	d(KeyCode.KEY_7, KeyboardEventCode.Digit7);
	d(KeyCode.KEY_8, KeyboardEventCode.Digit8);
	d(KeyCode.KEY_9, KeyboardEventCode.Digit9);

	d(KeyCode.Meta, KeyboardEventCode.MetaLeft);
	// TODO => MetaLeft, MetaRight
	d(KeyCode.ContextMenu, KeyboardEventCode.ContextMenu);

	d(KeyCode.F1, KeyboardEventCode.F1);
	d(KeyCode.F2, KeyboardEventCode.F2);
	d(KeyCode.F3, KeyboardEventCode.F3);
	d(KeyCode.F4, KeyboardEventCode.F4);
	d(KeyCode.F5, KeyboardEventCode.F5);
	d(KeyCode.F6, KeyboardEventCode.F6);
	d(KeyCode.F7, KeyboardEventCode.F7);
	d(KeyCode.F8, KeyboardEventCode.F8);
	d(KeyCode.F9, KeyboardEventCode.F9);
	d(KeyCode.F10, KeyboardEventCode.F10);
	d(KeyCode.F11, KeyboardEventCode.F11);
	d(KeyCode.F12, KeyboardEventCode.F12);
	d(KeyCode.F13, KeyboardEventCode.F13);
	d(KeyCode.F14, KeyboardEventCode.F14);
	d(KeyCode.F15, KeyboardEventCode.F15);
	d(KeyCode.F16, KeyboardEventCode.F16);
	d(KeyCode.F17, KeyboardEventCode.F17);
	d(KeyCode.F18, KeyboardEventCode.F18);
	d(KeyCode.F19, KeyboardEventCode.F19);

	d(KeyCode.NumLock, KeyboardEventCode.NumLock);
	d(KeyCode.ScrollLock, KeyboardEventCode.ScrollLock);

	d(KeyCode.NUMPAD_0, KeyboardEventCode.Numpad0);
	d(KeyCode.NUMPAD_1, KeyboardEventCode.Numpad1);
	d(KeyCode.NUMPAD_2, KeyboardEventCode.Numpad2);
	d(KeyCode.NUMPAD_3, KeyboardEventCode.Numpad3);
	d(KeyCode.NUMPAD_4, KeyboardEventCode.Numpad4);
	d(KeyCode.NUMPAD_5, KeyboardEventCode.Numpad5);
	d(KeyCode.NUMPAD_6, KeyboardEventCode.Numpad6);
	d(KeyCode.NUMPAD_7, KeyboardEventCode.Numpad7);
	d(KeyCode.NUMPAD_8, KeyboardEventCode.Numpad8);
	d(KeyCode.NUMPAD_9, KeyboardEventCode.Numpad9);

	d(KeyCode.NUMPAD_MULTIPLY, KeyboardEventCode.NumpadMultiply);
	d(KeyCode.NUMPAD_ADD, KeyboardEventCode.NumpadAdd);
	d(KeyCode.NUMPAD_SEPARATOR, KeyboardEventCode.NumpadComma);
	d(KeyCode.NUMPAD_SUBTRACT, KeyboardEventCode.NumpadSubtract);
	d(KeyCode.NUMPAD_DECIMAL, KeyboardEventCode.NumpadDecimal);
	d(KeyCode.NUMPAD_DIVIDE, KeyboardEventCode.NumpadDivide);
})();
