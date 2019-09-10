Ext.define('PVE.form.CPUModelSelector', {
    extend: 'Proxmox.form.ComboGrid',
    alias: ['widget.CPUModelSelector'],

    valueField: 'value',
    displayField: 'value',

    emptyText: Proxmox.Utils.defaultText + ' (kvm64)',
    allowBlank: true,

    editable: true,
    anyMatch: true,
    forceSelection: true,
    autoSelect: false,

    deleteEmpty: true,

    listConfig: {
	columns: [
	    {
		header: gettext('Model'),
		dataIndex: 'value',
		hideable: false,
		sortable: true,
		flex: 2
	    },
	    {
		header: gettext('Vendor'),
		dataIndex: 'vendor',
		hideable: false,
		sortable: true,
		flex: 1
	    }
	],
	width: 320
    },

    store: {
	fields: [ 'value', 'vendor' ],
	data: [
	    {
		value: 'athlon',
		vendor: 'AMD'
	    },
	    {
		value: 'phenom',
		vendor: 'AMD'
	    },
	    {
		value: 'Opteron_G1',
		vendor: 'AMD'
	    },
	    {
		value: 'Opteron_G2',
		vendor: 'AMD'
	    },
	    {
		value: 'Opteron_G3',
		vendor: 'AMD'
	    },
	    {
		value: 'Opteron_G4',
		vendor: 'AMD'
	    },
	    {
		value: 'Opteron_G5',
		vendor: 'AMD'
	    },
	    {
		value: 'EPYC',
		vendor: 'AMD'
	    },
	    {
		value: '486',
		vendor: 'Intel'
	    },
	    {
		value: 'core2duo',
		vendor: 'Intel'
	    },
	    {
		value: 'coreduo',
		vendor: 'Intel'
	    },
	    {
		value: 'pentium',
		vendor: 'Intel'
	    },
	    {
		value: 'pentium2',
		vendor: 'Intel'
	    },
	    {
		value: 'pentium3',
		vendor: 'Intel'
	    },
	    {
		value: 'Conroe',
		vendor: 'Intel'
	    },
	    {
		value: 'Penryn',
		vendor: 'Intel'
	    },
	    {
		value: 'Nehalem',
		vendor: 'Intel'
	    },
	    {
		value: 'Westmere',
		vendor: 'Intel'
	    },
	    {
		value: 'SandyBridge',
		vendor: 'Intel'
	    },
	    {
		value: 'IvyBridge',
		vendor: 'Intel'
	    },
	    {
		value: 'Haswell',
		vendor: 'Intel'
	    },
	    {
		value: 'Haswell-noTSX',
		vendor: 'Intel'
	    },
	    {
		value: 'Broadwell',
		vendor: 'Intel'
	    },
	    {
		value: 'Broadwell-noTSX',
		vendor: 'Intel'
	    },
	    {
		value: 'Skylake-Client',
		vendor: 'Intel'
	    },
	    {
		value: 'Skylake-Server',
		vendor: 'Intel'
	    },
	    {
		value: 'Cascadelake-Server',
		vendor: 'Intel'
	    },
	    {
		value: 'KnightsMill',
		vendor: 'Intel'
	    },
	    {
		value: 'kvm32',
		vendor: 'Other'
	    },
	    {
		value: 'kvm64',
		vendor: 'Other'
	    },
	    {
		value: 'qemu32',
		vendor: 'Other'
	    },
	    {
		value: 'qemu64',
		vendor: 'Other'
	    },
	    {
		value: 'host',
		vendor: 'Other'
	    }
	]
    }
});
