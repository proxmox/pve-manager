Ext.define('PVE.form.BandwidthField', {
    extend: 'Ext.form.FieldContainer',
    alias: 'widget.pveBandwidthField',

    mixins: ['Proxmox.Mixin.CBind' ],

    viewModel: {
	data: {
	    unit: 'MiB',
	},
	formulas: {
	    unitlabel: (get) => get('unit') + '/s',
	},
    },

    emptyText: '',

    layout: 'hbox',
    defaults: {
	hideLabel: true,
    },

    units: {
	'KiB': 1024,
	'MiB': 1024*1024,
	'GiB': 1024*1024*1024,
	'KB': 1000,
	'MB': 1000*1000,
	'GB': 1000*1000*1000,
    },

    // display unit (TODO: make (optionally) selectable)
    unit: 'MiB',

    // use this if the backend saves values in another unit tha bytes, e.g.,
    // for KiB set it to 'KiB'
    backendUnit: undefined,

    items: [
	{
	    xtype: 'numberfield',
	    cbind: {
		name: '{name}',
		emptyText: '{emptyText}',
	    },
	    minValue: 0,
	    step: 1,
	    submitLocaleSeparator: false,
	    fieldStyle: 'text-align: right',
	    flex: 1,
	    enableKeyEvents: true,
	    setValue: function(v) {
		if (!this._transformed) {
		    let fieldct = this.up('pveBandwidthField');
		    let vm = fieldct.getViewModel();
		    let unit = vm.get('unit');

		    v /= fieldct.units[unit];
		    v *= fieldct.backendFactor;

		    this._transformed = true;
		}

		if (v == 0) v = undefined;

		return Ext.form.field.Text.prototype.setValue.call(this, v);
	    },
	    getSubmitValue: function() {
		let v = this.processRawValue(this.getRawValue());
		v = v.replace(this.decimalSeparator, '.')

		if (v === undefined) return null;
		// FIXME: make it configurable, as this only works if 0 === default
		if (v == 0 || v == 0.0) return null;

		let fieldct = this.up('pveBandwidthField');
		let vm = fieldct.getViewModel();
		let unit = vm.get('unit');

		v = parseFloat(v) * fieldct.units[unit];
		v /= fieldct.backendFactor;

		return ''+ Math.floor(v);
	    },
	    listeners: {
		// our setValue gets only called if we have a value, avoid
		// transformation of the first user-entered value
		keydown: function () { this._transformed = true; },
	    },
	},
	{
	    xtype: 'displayfield',
	    name: 'unit',
	    submitValue: false,
	    padding: '0 0 0 10',
	    bind: {
		value: '{unitlabel}',
	    },
	    listeners: {
		change: (f, v) => f.originalValue = v,
	    },
	    width: 40,
	},
    ],

    initComponent: function() {
	let me = this;

	me.unit = me.unit || 'MiB';
	if (!(me.unit in me.units)) {
	    throw "unknown unit: " + me.unit;
	}

	me.backendFactor = 1;
	if (me.backendUnit !== undefined) {
	    if (!(me.unit in me.units)) {
		throw "unknown backend unit: " + me.backendUnit;
	    }
	    me.backendFactor = me.units[me.backendUnit];
	}


	me.callParent(arguments);

	me.getViewModel().set('unit', me.unit);
    },
});

