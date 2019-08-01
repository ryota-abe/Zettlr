// Tree View item component
const findObject = require('../../common/util/find-object')

module.exports = {
  name: 'tree-item',
  props: [
    'obj', // The actual object
    'depth' // How deep is this item nested?
  ],
  watch: {
    selectedFile: function (oldVal, newVal) {
      // Open the tree on selectedFile change, if the
      // selected file is contained in this dir somewhere
      if (findObject(this.obj, 'hash', this.selectedFile, 'children')) this.collapsed = false
    }
  },
  data: () => {
    return {
      collapsed: true // Initial: collapsed list (if there are children)
    }
  },
  template: `
    <div class="container"
      v-bind:data-hash="obj.hash"
      v-bind:draggable="!isRoot"
      v-on:dragstart.stop="beginDragging"
      v-on:dragenter.stop="enterDragging"
      v-on:dragleave.stop="leaveDragging"
    >
      <div
        v-bind:class="classList"
        v-bind:data-hash="obj.hash"
        v-on:click="requestSelection"
        v-bind:style="pad"
        ref="listElement"
        v-on:drop="handleDrop"
        v-on:dragover="acceptDrags"
      >
        <p class="filename" v-bind:data-hash="obj.hash">
          <span v-show="hasChildren" v-on:click.stop="toggleCollapse" v-bind:class="indicatorClass"></span>
          {{ obj.name }}<span v-if="hasDuplicateName" class="dir">&nbsp;({{ dirname }})</span>
        </p>
      </div>
      <div v-if="hasSearchResults" class="display-search-results list-item" v-on:click="this.$root.toggleFileList">
        Display search results
      </div>
      <div v-if="isDirectory" v-show="!collapsed">
        <tree-item
          v-for="child in filteredChildren"
          v-bind:obj="child"
          v-bind:key="child.hash"
          v-bind:depth="depth + 1"
        >
        </tree-item>
      </div>
    </div>
  `,
  computed: {
    /**
     * Returns true if this component is a root
     */
    isRoot: function () { return this.$root === this.$parent },
    /**
     * Returns true if this is a directory
     */
    isDirectory: function () { return ['directory', 'virtual-directory'].includes(this.obj.type) },
    /**
     * Shortcut methods to access the store
     */
    selectedFile: function () { return this.$store.state.selectedFile },
    selectedDir: function () { return this.$store.state.selectedDirectory },
    /**
     * Returns true if the sidebarMode is set to "combined"
     */
    combined: function () { return this.$store.state.sidebarMode === 'combined' },
    /**
     * Returns true if there are children that can be displayed
     */
    hasChildren: function () {
      // Return true if it's a directory, with at least one directory as children
      if (!this.obj.hasOwnProperty('children')) return false
      return this.isDirectory && this.filteredChildren.length > 0
    },
    /**
     * Returns the directory name. TODO: Migrate to NodeJS Path
     */
    dirname: function () {
      let name = this.obj.path.substr(0, this.obj.path.lastIndexOf('/'))
      return name.substr(name.lastIndexOf('/') + 1)
    },
    /**
     * Computes the classList property for the container and returns it
     */
    classList: function () {
      let list = 'list-item ' + this.obj.type
      if (this.$parent.type === 'virtual-dir') list += ' vd-file'
      if ([this.selectedFile, this.selectedDir].includes(this.obj.hash)) list += ' selected'
      if (this.combined) list += ' combined'
      // Determine if this is a root component
      if (this.isRoot) list += ' root'
      return list
    },
    /**
     * Returns true, if this is actually a TeX-file
     */
    isTex: function () { return this.obj.ext === '.tex' },
    /**
     * Returns a list of children that can be displayed inside the tree view
     */
    filteredChildren: function () {
      return this.combined ? this.obj.children : this.obj.children.filter(e => e.type !== 'file')
    },
    /**
     * Returns the correct indicator class (necessary for the indicator CSS content property)
     */
    indicatorClass: function () { return this.collapsed ? 'collapse-indicator collapsed' : 'collapse-indicator' },
    /**
     * Returns the amount of padding that should be applied, based on the depth
     */
    pad: function () { return `padding-left: ${this.depth}em` },
    /**
     * Returns true if this is a root file and has the same name as another root file
     */
    hasDuplicateName: function () {
      if (this.isRoot && !this.isDirectory) {
        let elem = this.$store.state.items.filter(elem => elem.name === this.obj.name)
        if (elem.length > 1) return true
      }
      return false
    },
    /**
     * returns true, if this is the current selected directory, there
     * are search results and the sidebar is in combined mode
     */
    hasSearchResults: function () {
      // Should return true, if this directory has search results in combined mode
      if (!this.combined) return false
      if (this.$store.state.searchResults.length < 1) return false
      if (this.obj.hash !== this.selectedDir) return false
      return true
    }
  },
  /**
   * Callable methods
   */
  methods: {
    /**
     * On click, this will call the selection function.
     */
    requestSelection: function () {
      if (this.obj.type === 'file') {
        global.ipc.send('file-get', this.obj.hash)
      } else {
        global.ipc.send('dir-select', this.obj.hash)
        this.collapsed = false // Also open the directory
      }
    },
    /**
     * On a click on the indicator, this'll toggle the collapsed state
     */
    toggleCollapse: function (event) { this.collapsed = !this.collapsed },
    /**
     * Initiates a drag movement and inserts the correct data
     * @param {DragEvent} event The drag event
     */
    beginDragging: function (event) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.dropEffect = 'move'
      event.dataTransfer.setData('text', JSON.stringify({
        'hash': this.obj.hash,
        'type': this.obj.type // Can be file or directory
      }))
    },
    /**
     * Called when a drag operation enters this item; adds a highlight class
     */
    enterDragging: function (event) {
      if (this.isDirectory) this.$refs.listElement.classList.add('highlight')
    },
    /**
     * The oppossite of enterDragging; removes the highlight class
     */
    leaveDragging: function (event) {
      if (this.isDirectory) this.$refs.listElement.classList.remove('highlight')
    },
    /**
     * Called whenever something is dropped onto the element.
     * Only executes if it's a valid tree-item/file-list object.
     */
    handleDrop: function (event) {
      this.$refs.listElement.classList.remove('highlight')
      event.preventDefault()
      // Now we have to be careful. The user can now ALSO
      // drag and drop files right onto the list. So we need
      // to make sure it's really an element from in here and
      // NOT a file, because these need to be handled by the
      // app itself.
      let data
      try {
        data = JSON.parse(event.dataTransfer.getData('text'))
      } catch (e) {
        // Error in JSON stringifying (either b/c malformed or no text)
        return
      }

      // The user dropped the file onto itself
      if (data.hash === this.obj.hash) return

      // Finally, request the move!
      global.ipc.send('request-move', { 'from': parseInt(data.hash), 'to': this.obj.hash })
    },
    /**
     * Makes sure the browser doesn't do unexpected stuff when dragging, e.g., external files.
     * @param {DragEvent} event The drag event
     */
    acceptDrags: function (event) {
      // We need to constantly preventDefault to ensure
      // that, e.g., a Python or other script file doesn't
      // override the location.href to display.
      event.preventDefault()
    }
  }
}