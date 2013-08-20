/*jslint confusion: true */
Ext.define('PVE.openvz.BeanCounterGrid', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveBeanCounterGrid'],

    renderUbc: function(value, metaData, record, rowIndex, colIndex, store) {

	if (value === 9223372036854775807) {
	    return '-';
	}

	if (record.id.match(/pages$/)) {
	    return PVE.Utils.format_size(value*4096);
	}
	if (record.id.match(/(size|buf)$/)) {
	    return PVE.Utils.format_size(value);
	}

	return value;
    },

    initComponent : function() {
	var me = this;

	if (!me.url) {
	    throw "no url specified";
	}

	var store = new Ext.data.Store({
	    model: 'pve-openvz-ubc',
	    proxy: {
		type: 'pve',
		url: me.url
	    },
	    sorters: [
		{
		    property : 'id',
		    direction: 'ASC'
		}
	    ]
	});

	var reload = function() {
	    store.load();
	};

	Ext.applyIf(me, {
	    store: store,
	    stateful: false,
	    columns: [
		{
		    header: gettext('Resource'),
		    width: 100,
		    dataIndex: 'id'
		},
		{
		    header: gettext('Held'),
		    width: 100,
		    renderer: me.renderUbc,
		    dataIndex: 'held'
		},
		{
		    header: gettext('Maxheld'),
		    width: 100,
		    renderer: me.renderUbc,
		    dataIndex: 'maxheld'
		},
		{
		    header: gettext('Barrier'),
		    width: 100,
		    renderer: me.renderUbc,
		    dataIndex: 'bar'
		},
		{
		    header: gettext('Limit'),
		    width: 100,
		    renderer: me.renderUbc,
		    dataIndex: 'lim'
		},
		{
		    header: gettext('Failcnt'),
		    width: 100,
		    dataIndex: 'failcnt'
		}
	    ],
	    listeners: {
		show: reload
	    }
	});

	me.callParent();

   }
}, function() {

    Ext.define('pve-openvz-ubc', {
	extend: "Ext.data.Model",
	fields: [ 'id', 
		  { name: 'held', type: 'number' },
		  { name: 'maxheld', type: 'number' },
		  { name: 'bar', type: 'number' },
		  { name: 'lim', type: 'number' },
		  { name: 'failcnt', type: 'number' }
		]
    });

});
